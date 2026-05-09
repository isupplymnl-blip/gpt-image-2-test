/**
 * GrsAI Native Image Generation Route
 * Uses /v1/api/generate (NOT OpenAI-compat) per official API docs.
 * Returns {id, status, results:[{url}]} — download CDN URL, save locally.
 */

import { NextRequest } from 'next/server';
import { getGeneratedDir, makeGeneratedUrl } from '../../lib/storage';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const GRSAI_BASE = (process.env.GRSAI_BASE_URL ?? 'https://grsaiapi.com').replace(/\/$/, '');

function roleLabel(role?: string): string {
  if (role === 'model') return 'model reference';
  if (role === 'product') return 'product reference';
  if (role === 'setting') return 'setting reference';
  if (role === 'style') return 'style reference';
  return 'reference image';
}

/** Log response metadata + headers without dumping multi-MB b64 image data. */
function logGrsaiResponse(tag: string, response: Response, parsed: unknown, elapsedMs: number) {
  const headers: Record<string, string> = {};
  const interestingHeaders = [
    'x-request-id', 'cf-ray', 'content-type',
    'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
    'retry-after',
  ];
  for (const h of interestingHeaders) {
    const v = response.headers.get(h);
    if (v) headers[h] = v;
  }

  // Strip data: URLs from any string field in the parsed body before logging.
  const stripDataUrls = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (v.startsWith('data:image')) return `<data-url ${v.length} chars>`;
      return v.length > 500 ? `${v.slice(0, 500)}...<truncated ${v.length - 500} chars>` : v;
    }
    if (Array.isArray(v)) return v.map(stripDataUrls);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = stripDataUrls(val);
      return out;
    }
    return v;
  };

  console.log(`[${tag}] ── RESPONSE FROM GRSAI (${response.status} ${response.statusText}, ${elapsedMs}ms) ──`);
  console.log(`[${tag}] headers:`, JSON.stringify(headers, null, 2));
  console.log(`[${tag}] body:`, JSON.stringify(stripDataUrls(parsed), null, 2));
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function toBase64(urlOrPath: string): Promise<string> {
  let inputBuf: Buffer;
  if (urlOrPath.startsWith('/')) {
    const { urlToFilePath } = await import('../../lib/storage');
    inputBuf = await readFile(urlToFilePath(urlOrPath));
  } else {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status} ${urlOrPath}`);
    inputBuf = Buffer.from(await res.arrayBuffer());
  }
  const outputBuf = await sharp(inputBuf)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${outputBuf.toString('base64')}`;
}

type GrsaiResponse = {
  id: string;
  status: 'running' | 'succeeded' | 'violation' | 'failed' | string;
  results?: Array<{ url?: string }>;
  progress?: number;
  error?: string;
};

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        const body = await req.json();
        const { prompt, settings, referenceImages, referenceUrls } = body as {
          prompt: string;
          settings?: Record<string, unknown>;
          referenceImages?: Array<{ url: string; name: string; role?: string } | string>;
          referenceUrls?: string[];
        };

        const rawRefs: Array<{ url: string; name: string; role?: string } | string> =
          referenceImages || referenceUrls || [];
        const refs = rawRefs.map(r => (typeof r === 'string' ? r : r.url));

        console.log('[grsai] received referenceImages:', referenceImages);
        console.log('[grsai] received referenceUrls:', referenceUrls);
        console.log('[grsai] merged refs:', refs);

        if (!prompt || typeof prompt !== 'string') {
          send('error', { error: 'Prompt is required' });
          controller.close();
          return;
        }

        const apiKey = process.env.GRSAI_API_KEY;
        console.log('[grsai] env check: GRSAI_API_KEY present=', !!apiKey, 'len=', apiKey?.length ?? 0);
        if (!apiKey) {
          console.error('[grsai] GRSAI_API_KEY missing — aborting');
          send('error', { error: 'GRSAI_API_KEY not set' });
          controller.close();
          return;
        }

        // Convert reference images to base64 data URLs (grsAI images[] is string[])
        const t0Refs = Date.now();
        const imageRefs: string[] = [];
        for (const url of refs) {
          try {
            imageRefs.push(await toBase64(url));
          } catch (err) {
            console.warn('[grsai] Failed to load reference image:', url, err instanceof Error ? err.message : err);
          }
        }
        console.log(`[grsai] ref loading: ${imageRefs.length}/${refs.length} loaded in ${Date.now() - t0Refs}ms`);

        let enrichedPrompt = prompt;
        if (imageRefs.length > 0 && !prompt.includes('Image 1')) {
          const labelParts = rawRefs.map((r, i) => `Image ${i + 1} = ${roleLabel(typeof r === 'string' ? undefined : r.role)}`);
          enrichedPrompt = `${labelParts.join(', ')}.\n${prompt}`;
        }

        const model = (settings?.model as string | undefined) ?? 'gpt-image-2';

        // grsAI uses aspectRatio (e.g. "1024x1024"), not OpenAI size
        const aspectRatio: string =
          (settings?.aspectRatio as string | undefined) ??
          (settings?.imageSize as string | undefined) ??
          (settings?.size as string | undefined) ??
          '1024x1024';

        const requestBody: Record<string, unknown> = {
          model,
          prompt: enrichedPrompt,
          aspectRatio,
          replyType: 'json',
          ...(imageRefs.length > 0 ? { images: imageRefs } : {}),
        };

        console.log(`[grsai] ── REQUEST TO GRSAI ──`);
        console.log(`[grsai] endpoint: POST ${GRSAI_BASE}/v1/api/generate`);
        console.log(`[grsai] model: ${model}`);
        console.log(`[grsai] aspectRatio: ${aspectRatio}`);
        console.log(`[grsai] replyType: json`);
        console.log(`[grsai] parts: [text(${enrichedPrompt.length} chars)${imageRefs.length > 0 ? `, ${imageRefs.length} reference image(s)` : ''}]`);

        // Heartbeat while waiting for slow generation (30-60s)
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch { /* closed */ }
        }, 15_000);

        const t0 = Date.now();
        let response: Response;
        try {
          response = await fetch(`${GRSAI_BASE}/v1/api/generate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
        } finally {
          clearInterval(heartbeat);
        }

        const elapsed = Date.now() - t0;
        const responseText = await response.text();

        if (!response.ok) {
          console.error(`[grsai] API error ${response.status} ${response.statusText} (${elapsed}ms)`);
          console.error(`[grsai] error body:`, responseText.slice(0, 1000));
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            send('error', { error: `Rate limit exceeded${retryAfter ? ` — retry after ${retryAfter}s` : ''}` });
          } else {
            send('error', { error: `GrsAI API error: ${response.status} ${responseText}` });
          }
          controller.close();
          return;
        }

        let parsed: GrsaiResponse;
        try {
          parsed = JSON.parse(responseText) as GrsaiResponse;
        } catch {
          console.error(`[grsai] non-JSON response (${elapsed}ms):`, responseText.slice(0, 500));
          send('error', { error: `GrsAI returned non-JSON: ${responseText.slice(0, 200)}` });
          controller.close();
          return;
        }

        logGrsaiResponse('grsai', response, parsed, elapsed);

        if (parsed.status === 'violation') {
          console.warn(`[grsai] content policy violation id=${parsed.id} error=${parsed.error ?? '(none)'}`);
          send('error', { error: 'Content policy violation' });
          controller.close();
          return;
        }

        if (parsed.status === 'failed') {
          console.error(`[grsai] generation failed id=${parsed.id} error=${parsed.error ?? '(none)'}`);
          send('error', { error: parsed.error ?? 'Generation failed' });
          controller.close();
          return;
        }

        const cdnUrl = parsed.results?.[0]?.url;
        if (!cdnUrl) {
          console.error(`[grsai] no image URL in response status=${parsed.status} id=${parsed.id}`);
          send('error', { error: `No image URL in GrsAI response (status: ${parsed.status})` });
          controller.close();
          return;
        }

        // Download CDN image and save locally
        console.log(`[grsai] downloading from CDN: ${cdnUrl}`);
        const t0Dl = Date.now();
        const imgRes = await fetch(cdnUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image from CDN: ${imgRes.status}`);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        console.log(`[grsai] CDN download: ${imgBuf.length} bytes in ${Date.now() - t0Dl}ms`);

        const generatedDir = getGeneratedDir();
        await mkdir(generatedDir, { recursive: true });
        const filename = `grsai-${Date.now()}.png`;
        await writeFile(join(generatedDir, filename), imgBuf);
        const imageUrl = makeGeneratedUrl(filename);
        console.log(`[grsai] saved → ${filename} (total ${Date.now() - t0}ms end-to-end)`);

        send('complete', { imageUrl });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error('[grsai] error:', message);
        if (stack) console.error('[grsai] stack:', stack);
        try {
          controller.enqueue(encoder.encode(sse('error', { error: message })));
        } catch { /* already closed */ }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
