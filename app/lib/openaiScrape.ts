/**
 * Core SSE scraper for OpenAI image generation.
 * Used by /api/scrape-pre-moderation and any cascade routes.
 *
 * Returns every partial_images frame + final image bytes + any block reason.
 * Never throws on moderation — returns blocked=true with frames intact.
 */

export type ScrapeFrame = { index: number; b64: string };

export type ScrapeResult = {
  frames: ScrapeFrame[];
  finalB64: string | null;
  revisedPrompt?: string;
  blockReason?: string;
  blocked: boolean;
  httpStatus: number;
  endpoint: string;
  model: string;
};

export type ScrapeOptions = {
  apiKey: string;
  /** Defaults to https://api.openai.com — pass grsaiapi.com etc. for proxies. */
  baseUrl?: string;
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  background?: string;
  moderation?: 'auto' | 'low';
  output_format?: string;
  output_compression?: number;
  n?: number;
  partialImages?: number;
  /** Data-URL base64 references. When present, edits endpoint is used. */
  imageRefs?: Array<{ image_url: string }>;
  /** Force endpoint: 'generations' or 'edits'. Default: auto based on refs. */
  forceEndpoint?: 'generations' | 'edits';
  /** Retry 400 "content policies" responses (GrsAI load-shed). Default 0. */
  retryOn400ContentPolicy?: number;
};

/**
 * One scrape pass against OpenAI. Collects all partial SSE frames and final image.
 * Tolerates mid-stream moderation errors by returning whatever was captured.
 */
export async function scrapeOpenAI(opts: ScrapeOptions): Promise<ScrapeResult> {
  const {
    apiKey,
    baseUrl = 'https://api.openai.com',
    prompt,
    model = 'gpt-image-2',
    partialImages = 3,
    imageRefs,
    forceEndpoint,
    retryOn400ContentPolicy = 0,
  } = opts;

  const useEdits = forceEndpoint === 'edits' || (forceEndpoint !== 'generations' && (imageRefs?.length ?? 0) > 0);
  const endpoint = useEdits ? '/v1/images/edits' : '/v1/images/generations';
  const cleanBase = baseUrl.replace(/\/$/, '');

  const requestBody: Record<string, unknown> = {
    model,
    prompt,
    stream: true,
    partial_images: Math.max(1, Math.min(3, partialImages)),
  };
  if (useEdits && imageRefs?.length) requestBody.images = imageRefs;
  // GrsAI doesn't expose /v1/images/edits — refs travel via `images` on generations.
  // If forceEndpoint=generations but we have refs, still include them.
  if (!useEdits && imageRefs?.length) requestBody.images = imageRefs;
  if (opts.size !== undefined) requestBody.size = opts.size;
  if (opts.quality !== undefined) requestBody.quality = opts.quality;
  if (opts.background !== undefined) requestBody.background = opts.background;
  if (opts.moderation !== undefined) requestBody.moderation = opts.moderation;
  if (opts.output_format !== undefined) requestBody.output_format = opts.output_format;
  if (opts.output_compression !== undefined) requestBody.output_compression = opts.output_compression;
  if (opts.n !== undefined) requestBody.n = opts.n;

  // Retry loop for GrsAI-style fake 400 content-policy load-shedding
  let response!: Response;
  const maxAttempts = 1 + Math.max(0, retryOn400ContentPolicy);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    response = await fetch(`${cleanBase}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (response.status !== 400 || attempt === maxAttempts) break;
    const peek = await response.clone().text().catch(() => '');
    if (!/content policies/i.test(peek)) break;
    console.warn(`[scrapeOpenAI] retry ${attempt}/${maxAttempts - 1} — fake 400 content policy`);
  }

  const frames: ScrapeFrame[] = [];
  let finalB64: string | null = null;
  let revisedPrompt: string | undefined;
  let blockReason: string | undefined;

  if (!response.ok || !response.body) {
    const txt = await response.text().catch(() => '');
    const isMod = response.status === 400 && /moderation|content[_ ]?policy|safety/i.test(txt);
    return {
      frames, finalB64, revisedPrompt,
      blockReason: isMod ? txt : txt || `HTTP ${response.status}`,
      blocked: true,
      httpStatus: response.status,
      endpoint, model,
    };
  }

  // Some OpenAI-compatible providers (e.g. GrsAI on lower tiers) ignore
  // stream:true and return one shot JSON with { data: [{url|b64_json}] }.
  // Detect and handle — no partials available, but still surface the final.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    const json = await response.json().catch(() => null) as
      | { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>; error?: { message?: string } }
      | null;
    if (json?.error?.message) blockReason = json.error.message;
    if (json?.data?.length) {
      for (const item of json.data) {
        if (item.b64_json) finalB64 = item.b64_json;
        if (item.revised_prompt) revisedPrompt = item.revised_prompt;
        // URL-only response — fetch and convert to b64 so caller gets uniform shape
        if (!item.b64_json && item.url) {
          try {
            const imgRes = await fetch(item.url);
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              finalB64 = buf.toString('base64');
            }
          } catch (e) {
            console.warn('[scrapeOpenAI] url fetch fail', e instanceof Error ? e.message : e);
          }
        }
      }
    }
    return {
      frames,
      finalB64,
      revisedPrompt,
      blockReason: blockReason ?? (finalB64 ? undefined : 'No image in sync JSON response'),
      blocked: !finalB64,
      httpStatus: response.status,
      endpoint, model,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const debug = process.env.SCRAPE_DEBUG === '1';
  const rawLog: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (debug && line.trim()) rawLog.push(line);
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;

      let parsed: {
        type?: string;
        index?: number;
        partial_image_index?: number;
        sequence_number?: number;
        b64_json?: string;
        revised_prompt?: string;
        partial_images?: Array<{ index: number; b64_json: string }>;
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
        error?: { message?: string; code?: string };
      };
      try { parsed = JSON.parse(raw); } catch { continue; }

      if (debug) {
        const keys = Object.keys(parsed);
        const preview = JSON.stringify(parsed).slice(0, 200).replace(/"b64_json":"[^"]{0,40}[^"]+"/g, '"b64_json":"<B64>"');
        console.log(`[scrape-debug] keys=[${keys.join(',')}] preview=${preview}`);
      }

      if (parsed.error?.message) blockReason = parsed.error.message;

      // Shape A: OpenAI native SSE — `type: "image_generation.partial_image"`
      if (parsed.type === 'image_generation.partial_image' && parsed.b64_json) {
        const idx = parsed.partial_image_index ?? parsed.sequence_number ?? frames.length;
        frames.push({ index: idx, b64: parsed.b64_json });
        continue;
      }

      // Shape B: OpenAI native SSE — `type: "image_generation.completed"`
      if (parsed.type === 'image_generation.completed' && parsed.b64_json) {
        finalB64 = parsed.b64_json;
        continue;
      }

      // Shape C: older `type: "partial_image"` (kept for forward compat)
      if (parsed.type === 'partial_image' && parsed.b64_json) {
        frames.push({ index: parsed.index ?? parsed.partial_image_index ?? frames.length, b64: parsed.b64_json });
        continue;
      }

      // Shape D: batched `partial_images: [...]`
      if (parsed.partial_images?.length) {
        for (const p of parsed.partial_images) {
          if (p.b64_json) frames.push({ index: p.index, b64: p.b64_json });
        }
      }

      // Shape E: proxy-wrapped final `data: [{b64_json|url, revised_prompt}]`
      if (parsed.data?.length) {
        for (const item of parsed.data) {
          if (item.b64_json) finalB64 = item.b64_json;
          if (item.url && !item.b64_json) {
            try {
              const imgRes = await fetch(item.url);
              if (imgRes.ok) finalB64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
            } catch { /* ignore */ }
          }
          if (item.revised_prompt) revisedPrompt = item.revised_prompt;
        }
      }

      if (parsed.revised_prompt) revisedPrompt = parsed.revised_prompt;
    }
  }

  if (debug && rawLog.length === 0) {
    console.log('[scrape-debug] stream drained with ZERO non-empty lines');
  } else if (debug) {
    console.log(`[scrape-debug] captured ${rawLog.length} raw lines, ${frames.length} frames, finalB64=${!!finalB64}`);
  }

  frames.sort((a, b) => a.index - b.index);
  return {
    frames,
    finalB64,
    revisedPrompt,
    blockReason,
    blocked: !finalB64,
    httpStatus: response.status,
    endpoint,
    model,
  };
}

/** 1×1 transparent PNG data URL — used to force edits endpoint without a real ref. */
export const TRANSPARENT_PIXEL_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
