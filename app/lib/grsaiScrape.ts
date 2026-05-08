/**
 * GrsAI native scraper — uses /v1/api/generate (NOT OpenAI-compat route).
 *
 * Why: GrsAI's moderation is post-hoc — image is generated + uploaded to CDN,
 * then the API response is flipped to "violation". If we grab the URL from
 * the polling endpoint before that flip, we get the pre-moderation image.
 *
 * Flow:
 *   1. POST /v1/api/generate { replyType: "async" } → { id, status: "running" }
 *   2. Poll GET /v1/api/result?id=<id> every POLL_MS ms
 *   3. As soon as results[0].url appears, download it (the CDN serves it
 *      regardless of whether API later reports violation)
 *   4. Return b64 of downloaded image
 */

export type GrsaiScrapeOptions = {
  apiKey: string;
  /** Default https://grsaiapi.com */
  baseUrl?: string;
  prompt: string;
  /** gpt-image-2 | gpt-image-2-vip */
  model?: string;
  /** e.g. "1024x1024", "1774x887" (16:9), "1024x1536" (2:3). Only vip supports 2K+. */
  aspectRatio?: string;
  /** Base64 data URLs or public URLs. */
  images?: string[];
  /** Poll interval ms. Default 250. */
  pollIntervalMs?: number;
  /** Max total wait ms before giving up. Default 180_000. */
  maxWaitMs?: number;
  /** Capture every URL that appears in results over time, not just first. Default false. */
  captureAllRevisions?: boolean;
};

export type GrsaiTaskStatus = 'running' | 'succeeded' | 'violation' | 'failed' | string;

export type GrsaiScrapeResult = {
  taskId: string | null;
  finalStatus: GrsaiTaskStatus;
  /** URL captured before moderation flip (if race won). */
  preModerationUrl: string | null;
  /** Base64 of downloaded image (pre-mod). */
  preModerationB64: string | null;
  /** All URLs seen across polls (if captureAllRevisions). */
  allUrls: string[];
  /** Timing: ms from generate POST to first URL seen. */
  firstUrlAfterMs: number | null;
  /** Timing: ms from first URL to final violation/fail. */
  urlToFinalMs: number | null;
  error?: string;
  pollCount: number;
  terminalResponse?: unknown;
};

type GenerateResponse = {
  id?: string;
  status?: GrsaiTaskStatus;
  results?: Array<{ url?: string }>;
  progress?: number;
  error?: string;
};

/** Kick off async gen, poll result fast, download first URL seen. */
export async function scrapeGrsai(opts: GrsaiScrapeOptions): Promise<GrsaiScrapeResult> {
  const {
    apiKey,
    baseUrl = 'https://grsaiapi.com',
    prompt,
    model = 'gpt-image-2',
    aspectRatio = '1024x1024',
    images,
    pollIntervalMs = 250,
    maxWaitMs = 180_000,
    captureAllRevisions = false,
  } = opts;

  const cleanBase = baseUrl.replace(/\/$/, '');
  const result: GrsaiScrapeResult = {
    taskId: null,
    finalStatus: 'running',
    preModerationUrl: null,
    preModerationB64: null,
    allUrls: [],
    firstUrlAfterMs: null,
    urlToFinalMs: null,
    pollCount: 0,
  };

  const generateBody: Record<string, unknown> = {
    model,
    prompt,
    aspectRatio,
    replyType: 'async',
  };
  if (images?.length) generateBody.images = images;

  const t0 = Date.now();

  // 1. Kick off async task
  const genRes = await fetch(`${cleanBase}/v1/api/generate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(generateBody),
  });

  const genJson = (await genRes.json().catch(() => ({}))) as GenerateResponse;
  result.terminalResponse = genJson;

  if (!genRes.ok || !genJson.id) {
    result.error = `generate failed: HTTP ${genRes.status} ${genJson.error ?? JSON.stringify(genJson).slice(0, 200)}`;
    result.finalStatus = (genJson.status as GrsaiTaskStatus) ?? 'failed';
    return result;
  }

  result.taskId = genJson.id;

  // 2. Poll result endpoint fast until terminal state
  let firstUrlTime: number | null = null;
  while (Date.now() - t0 < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    result.pollCount++;

    const pollRes = await fetch(
      `${cleanBase}/v1/api/result?id=${encodeURIComponent(genJson.id)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } },
    );
    const pollJson = (await pollRes.json().catch(() => ({}))) as GenerateResponse;
    result.terminalResponse = pollJson;

    // Capture any URL that appears, regardless of status — pre-moderation steal
    if (Array.isArray(pollJson.results)) {
      for (const r of pollJson.results) {
        if (r.url && !result.allUrls.includes(r.url)) {
          result.allUrls.push(r.url);
          if (!result.preModerationUrl) {
            result.preModerationUrl = r.url;
            firstUrlTime = Date.now();
            result.firstUrlAfterMs = firstUrlTime - t0;
          }
          if (!captureAllRevisions) break;
        }
      }
    }

    // Terminal states
    const status = pollJson.status;
    if (status === 'succeeded' || status === 'violation' || status === 'failed') {
      result.finalStatus = status;
      if (firstUrlTime) result.urlToFinalMs = Date.now() - firstUrlTime;
      if (status !== 'succeeded' && pollJson.error) result.error = pollJson.error;
      break;
    }
  }

  if (!['succeeded', 'violation', 'failed'].includes(result.finalStatus)) {
    result.finalStatus = 'failed';
    result.error = result.error ?? `timeout after ${maxWaitMs}ms`;
  }

  // 3. Download the URL we grabbed (works even after violation flip because
  //    the CDN is separate from GrsAI's API gatekeeper)
  if (result.preModerationUrl) {
    try {
      const dl = await fetch(result.preModerationUrl);
      if (dl.ok) {
        const buf = Buffer.from(await dl.arrayBuffer());
        result.preModerationB64 = buf.toString('base64');
      } else {
        result.error = (result.error ?? '') + ` | cdn download HTTP ${dl.status}`;
      }
    } catch (e) {
      result.error = (result.error ?? '') + ` | cdn fetch err: ${e instanceof Error ? e.message : 'unknown'}`;
    }
  }

  return result;
}
