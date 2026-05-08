/**
 * iThink OpenAI Image Generation API Route
 * OpenAI-compatible proxy via token.ithinkai.cn (cheaper alternative)
 * Mirrors pudding-openai routing/settings/streaming exactly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { getGeneratedDir, makeGeneratedUrl, urlToFilePath } from '../../lib/storage';
import { resolveOpenAISize } from '../../lib/openaiSizeResolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

function roleLabel(role?: string): string {
  if (role === 'model') return 'model reference';
  if (role === 'product') return 'product reference';
  if (role === 'setting') return 'setting reference';
  if (role === 'style') return 'style reference';
  return 'reference image';
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/** SSE wrapper with heartbeat to prevent Cloudflare 524 timeouts */
function sseWrap(runner: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: unknown) => {
        try {
          ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream already closed */ }
      };

      send('heartbeat', { ts: Date.now() });
      const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), 15_000);

      try {
        await runner(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[ithink-openai-stream] error:', message);
        send('error', { error: message });
      } finally {
        clearInterval(hb);
        ctrl.close();
      }
    },
  });

  return new Response(body, { headers: SSE_HEADERS });
}

/** Log response metadata + headers without dumping multi-MB b64 image data. */
function logIThinkResponse(tag: string, response: Response, data: any, elapsedMs: number) {
  const headers: Record<string, string> = {};
  const interestingHeaders = [
    'x-request-id', 'openai-version', 'openai-model', 'openai-organization',
    'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
    'x-ratelimit-limit-images', 'x-ratelimit-remaining-images',
    'x-ratelimit-reset-images', 'cf-ray', 'content-type',
  ];
  for (const h of interestingHeaders) {
    const v = response.headers.get(h);
    if (v) headers[h] = v;
  }

  const summarized = {
    ...data,
    data: Array.isArray(data?.data)
      ? data.data.map((item: any) => {
          const { b64_json, ...rest } = item ?? {};
          return {
            ...rest,
            b64_json_bytes: b64_json ? Buffer.byteLength(b64_json, 'base64') : 0,
          };
        })
      : data?.data,
  };

  console.log(`[${tag}] ── RESPONSE FROM ITHINK (${response.status} ${response.statusText}, ${elapsedMs}ms) ──`);
  console.log(`[${tag}] headers:`, JSON.stringify(headers, null, 2));
  console.log(`[${tag}] body:`, JSON.stringify(summarized, null, 2));
}

async function toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/png' }> {
  let inputBuf: Buffer;
  if (urlOrPath.startsWith('/')) {
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

  return { data: outputBuf.toString('base64'), mimeType: 'image/png' };
}

/**
 * Persist a One-API/New-API response item to local disk.
 * One-API may return either `b64_json` or `url` (hosted at webstatic.aiproxy.vip).
 * For URL responses we download the bytes and store under our own `/api/generated` URL
 * so the rest of the studio (library, batches, downloads) treats it identically.
 */
async function persistImageItem(
  item: { b64_json?: string; url?: string },
  format: string,
): Promise<string> {
  let buffer: Buffer;
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to download generated image: ${res.status} ${item.url}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error('Response item missing both b64_json and url');
  }

  const generatedDir = getGeneratedDir();
  await mkdir(generatedDir, { recursive: true });
  const timestamp = Date.now();
  const filename = `ithink-openai-${timestamp}.${format}`;
  const filepath = join(generatedDir, filename);
  await writeFile(filepath, buffer);
  return makeGeneratedUrl(filename);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, settings, useStreaming, referenceImages, referenceUrls } = body;
    const rawRefs: Array<{ url: string; name: string; role?: string } | string> = referenceImages || referenceUrls || [];
    const refs = rawRefs.map(r => typeof r === 'string' ? r : r.url);

    console.log('[ithink-openai] received referenceImages:', referenceImages);
    console.log('[ithink-openai] received referenceUrls:', referenceUrls);
    console.log('[ithink-openai] merged refs:', refs);

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ITHINK_OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ITHINK_OPENAI_API_KEY not set' },
        { status: 500 }
      );
    }

    const baseUrl = (process.env.ITHINK_OPENAI_BASE_URL ?? 'https://token.ithinkai.cn').replace(/\/$/, '');

    // Load reference images in parallel
    const t0Refs = Date.now();
    const refBuffers: Buffer[] = [];
    if (refs && Array.isArray(refs) && refs.length > 0) {
      const results = await Promise.allSettled(refs.map((url: string) => toBase64(url)));
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
          refBuffers.push(Buffer.from(r.value.data, 'base64'));
        } else {
          console.warn('[iThink OpenAI] Failed to load reference image:', refs[i], r.reason instanceof Error ? r.reason.message : r.reason);
        }
      }
    }
    console.log(`[ithink-openai] ref loading: ${refBuffers.length}/${refs.length} loaded in ${Date.now() - t0Refs}ms`);

    const useEdits = refBuffers.length > 0;

    // Route-level fallback: inject Image N role labels when refs are present and the
    // Director hasn't already written them into the prompt (detected by "Image 1" absence).
    let finalPrompt = prompt;
    if (useEdits && !prompt.includes('Image 1')) {
      const labelParts = rawRefs.map((r, i) => `Image ${i + 1} = ${roleLabel(typeof r === 'string' ? undefined : r.role)}`);
      finalPrompt = `${labelParts.join(', ')}.\n${prompt}`;
    }

    const model = (settings?.model as string | undefined) ?? 'gpt-image-2';

    // OpenAI-only params (strip Gemini-specific keys)
    const resolvedSize = resolveOpenAISize(
      settings?.imageSize as string | undefined,
      settings?.aspectRatio as string | undefined,
      settings?.size as string | undefined,
    );
    const openaiSettings = {
      ...(resolvedSize !== undefined ? { size: resolvedSize } : {}),
      ...(settings?.quality !== undefined ? { quality: settings.quality } : {}),
      ...(settings?.n !== undefined ? { n: settings.n } : {}),
      ...(settings?.background !== undefined ? { background: settings.background } : {}),
      ...(settings?.output_format !== undefined ? { output_format: settings.output_format } : {}),
      ...(settings?.moderation !== undefined ? { moderation: settings.moderation } : {}),
      ...(settings?.output_compression !== undefined ? { output_compression: settings.output_compression } : {}),
      ...(useEdits && settings?.input_fidelity !== undefined ? { input_fidelity: settings.input_fidelity } : {}),
    };

    console.log(`[ithink-openai] ── REQUEST TO ITHINK (${useEdits ? 'images/edits' : 'images/generations'}${useStreaming ? ', streaming' : ''}) ──`);
    console.log(`[ithink-openai] endpoint: POST ${baseUrl}/v1/${useEdits ? 'images/edits' : 'images/generations'}`);
    console.log(`[ithink-openai] model: ${model}`);
    console.log(`[ithink-openai] settings:`, JSON.stringify(openaiSettings, null, 2));
    console.log(`[ithink-openai] parts: [text(${finalPrompt.length} chars)${refBuffers.length > 0 ? `, ${refBuffers.length} reference image(s)` : ''}]`);

    function buildRequest(): { url: string; init: RequestInit } {
      if (useEdits) {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', finalPrompt);
        for (const [k, v] of Object.entries(openaiSettings)) {
          if (v !== undefined) form.append(k, String(v));
        }
        // OpenAI multipart spec: repeated singular `image` field for multiple refs
        // (Chinese proxies generally follow this; Pudding's `image[]` is the exception)
        for (let i = 0; i < refBuffers.length; i++) {
          const blob = new Blob([refBuffers[i] as unknown as ArrayBuffer], { type: 'image/png' });
          form.append('image', blob, `ref-${i}.png`);
        }

        // Sanity check: native FormData should set Content-Type with boundary
        const probe = new Request('http://probe', { method: 'POST', body: form });
        const contentType = probe.headers.get('content-type');
        console.log(`[ithink-openai] Content-Type: ${contentType}`);
        if (!contentType?.includes('boundary=')) {
          console.error(`[ithink-openai] WARNING: Content-Type missing boundary!`);
        }

        return {
          url: `${baseUrl}/v1/images/edits`,
          init: {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form,
          },
        };
      }
      return {
        url: `${baseUrl}/v1/images/generations`,
        init: {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: finalPrompt, ...openaiSettings }),
        },
      };
    }

    if (useStreaming) {
      return sseWrap(async (send) => {
const MAX_ATTEMPTS = 10;
        const ABORT_MS = 88_000; // abort at 88s — before CF's 100s kill

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const t0 = Date.now();
          const { url, init } = buildRequest();
          const ac = new AbortController();
          const timeout = setTimeout(() => ac.abort(), ABORT_MS);

          try {
            const response = await fetch(url, { ...init, signal: ac.signal });
            clearTimeout(timeout);

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[iThink OpenAI Error] attempt ${attempt}`, response.status, errorText);
              if (attempt < MAX_ATTEMPTS && (response.status === 524 || response.status === 503 || response.status === 554)) {
                console.log(`[ithink-openai] retrying (${attempt}/${MAX_ATTEMPTS})...`);
                continue;
              }
              throw new Error(`iThink API error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            logIThinkResponse('ithink-openai-stream', response, data, Date.now() - t0);
            if (!data.data || data.data.length === 0) throw new Error('No images generated');

            const format = settings?.output_format || 'png';
            const imageUrl = await persistImageItem(data.data[0], format);
            send('complete', { imageUrl, revisedPrompt: data.data?.[0]?.revised_prompt });
            return;
          } catch (err: any) {
            clearTimeout(timeout);
            const isAbort = err?.name === 'AbortError';
            console.error(`[ithink-openai] attempt ${attempt} ${isAbort ? 'timed out at 88s' : 'threw'}: ${err?.message}`);
            if (attempt < MAX_ATTEMPTS) {
              console.log(`[ithink-openai] retrying (${attempt}/${MAX_ATTEMPTS})...`);
              continue;
            }
            throw err;
          }
        }
      });
    }

    // Non-streaming path — same abort+retry
    const MAX_ATTEMPTS = 3;
    const ABORT_MS = 88_000;
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const t0 = Date.now();
      const { url, init } = buildRequest();
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), ABORT_MS);

      try {
        const response = await fetch(url, { ...init, signal: ac.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[iThink OpenAI Error] attempt ${attempt}`, response.status, errorText);
          lastError = `iThink API error: ${response.status}`;
          if (attempt < MAX_ATTEMPTS && (response.status === 524 || response.status === 503 || response.status === 554)) {
            console.log(`[ithink-openai] retrying (${attempt}/${MAX_ATTEMPTS})...`);
            continue;
          }
          return NextResponse.json({ error: lastError }, { status: response.status });
        }

        const data = await response.json();
        logIThinkResponse('ithink-openai', response, data, Date.now() - t0);
        if (!data.data || data.data.length === 0) {
          return NextResponse.json({ error: 'No images generated' }, { status: 500 });
        }

        const format = settings?.output_format || 'png';
        const imageUrl = await persistImageItem(data.data[0], format);
        return NextResponse.json({ success: true, imageUrl, revisedPrompt: data.data?.[0]?.revised_prompt, provider: 'ithink-openai' });

      } catch (err: any) {
        clearTimeout(timeout);
        const isAbort = err?.name === 'AbortError';
        lastError = isAbort ? 'iThink request timed out (88s) — retrying' : (err?.message ?? 'Generation failed');
        console.error(`[ithink-openai] attempt ${attempt} ${isAbort ? 'timed out' : 'threw'}: ${lastError}`);
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[ithink-openai] retrying (${attempt}/${MAX_ATTEMPTS})...`);
          continue;
        }
      }
    }

    return NextResponse.json({ error: lastError || 'All attempts failed' }, { status: 500 });

  } catch (error: any) {
    console.error('[iThink OpenAI Generate Error]', error);

    if (error.message?.includes('401') || error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Invalid iThink OpenAI API key' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Image generation failed' },
      { status: 500 }
    );
  }
}
