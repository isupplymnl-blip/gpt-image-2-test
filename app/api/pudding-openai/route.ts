/**
 * Pudding OpenAI Image Generation API Route
 * Uses Pudding proxy for OpenAI's gpt-image-2 (cheaper alternative)
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { getGeneratedDir, makeGeneratedUrl, urlToFilePath } from '../../lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
      const send = (event: string, data: unknown) =>
        ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send('heartbeat', { ts: Date.now() });
      const hb = setInterval(() => send('heartbeat', { ts: Date.now() }), 15_000);

      try {
        await runner(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[pudding-openai-stream] error:', message);
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
function logPuddingResponse(tag: string, response: Response, data: any, elapsedMs: number) {
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

  // Strip b64_json from each data item — keep everything else (revised_prompt, finish_reason, thinking, usage, etc.)
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

  console.log(`[${tag}] ── RESPONSE FROM PUDDINGAPI (${response.status} ${response.statusText}, ${elapsedMs}ms) ──`);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, settings, useStreaming, referenceImages, referenceUrls } = body;
    const refs = referenceImages || referenceUrls || [];

    console.log('[pudding-openai] received referenceImages:', referenceImages);
    console.log('[pudding-openai] received referenceUrls:', referenceUrls);
    console.log('[pudding-openai] merged refs:', refs);

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.PUDDING_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'PUDDING_API_KEY not set' },
        { status: 500 }
      );
    }

    const baseUrl = process.env.PUDDING_BASE_URL ?? 'https://new.apipudding.com';

    // Load reference images as PNG buffers (Pudding requires multipart for /v1/images/edits)
    const refBuffers: Buffer[] = [];
    if (refs && Array.isArray(refs)) {
      for (const url of refs) {
        try {
          const { data } = await toBase64(url);
          refBuffers.push(Buffer.from(data, 'base64'));
        } catch (err) {
          console.warn('[Pudding OpenAI] Failed to load reference image:', url, err instanceof Error ? err.message : err);
        }
      }
    }

    const useEdits = refBuffers.length > 0;

    const model = (settings?.model as string | undefined) ?? 'gpt-image-2';

    // OpenAI-only params (strip Gemini-specific keys)
    const openaiSettings = {
      ...(settings?.size !== undefined ? { size: String(settings.size).replace(/×/g, 'x') } : {}),
      ...(settings?.quality !== undefined ? { quality: settings.quality } : {}),
      ...(settings?.n !== undefined ? { n: settings.n } : {}),
      ...(settings?.background !== undefined ? { background: settings.background } : {}),
      ...(settings?.output_format !== undefined ? { output_format: settings.output_format } : {}),
      ...(settings?.moderation !== undefined ? { moderation: settings.moderation } : {}),
      ...(settings?.output_compression !== undefined ? { output_compression: settings.output_compression } : {}),
      ...(useEdits && settings?.input_fidelity !== undefined ? { input_fidelity: settings.input_fidelity } : {}),
    };

    console.log(`[pudding-openai] ── REQUEST TO PUDDINGAPI (${useEdits ? 'images/edits' : 'images/generations'}${useStreaming ? ', streaming' : ''}) ──`);
    console.log(`[pudding-openai] endpoint: POST ${baseUrl}/v1/${useEdits ? 'images/edits' : 'images/generations'}`);
    console.log(`[pudding-openai] model: ${model}`);
    console.log(`[pudding-openai] settings:`, JSON.stringify(openaiSettings, null, 2));
    console.log(`[pudding-openai] parts: [text(${prompt.length} chars)${refBuffers.length > 0 ? `, ${refBuffers.length} reference image(s)` : ''}]`);

    function buildRequest(): { url: string; init: RequestInit } {
      if (useEdits) {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', prompt);
        for (const [k, v] of Object.entries(openaiSettings)) {
          if (v !== undefined) form.append(k, String(v));
        }
        for (let i = 0; i < refBuffers.length; i++) {
          const blob = new Blob([refBuffers[i] as unknown as ArrayBuffer], { type: 'image/png' });
          form.append('image[]', blob, `ref-${i}.png`);
        }
        return {
          url: `${baseUrl}/v1/images/edits`,
          init: { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: form },
        };
      }
      return {
        url: `${baseUrl}/v1/images/generations`,
        init: {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, ...openaiSettings }),
        },
      };
    }

    if (useStreaming) {
      return sseWrap(async (send) => {
        const t0 = Date.now();
        const { url, init } = buildRequest();
        const response = await fetch(url, init);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Pudding OpenAI Error]', response.status, errorText);
          throw new Error(`Pudding API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        logPuddingResponse('pudding-openai-stream', response, data, Date.now() - t0);
        if (!data.data || data.data.length === 0) throw new Error('No images generated');
        const base64Data = data.data[0].b64_json;

        const generatedDir = getGeneratedDir();
        await mkdir(generatedDir, { recursive: true });
        const timestamp = Date.now();
        const format = settings?.output_format || 'png';
        const filename = `pudding-openai-${timestamp}.${format}`;
        const filepath = join(generatedDir, filename);

        const buffer = Buffer.from(base64Data, 'base64');
        await writeFile(filepath, buffer);

        const imageUrl = makeGeneratedUrl(filename);
        send('complete', { imageUrl, revisedPrompt: data.data?.[0]?.revised_prompt });
      });
    }

    // Non-streaming path
    const t0 = Date.now();
    const { url, init } = buildRequest();
    const response = await fetch(url, init);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Pudding OpenAI Error]', response.status, errorText);
      return NextResponse.json(
        { error: `Pudding API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logPuddingResponse('pudding-openai', response, data, Date.now() - t0);
    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ error: 'No images generated' }, { status: 500 });
    }
    const base64Data = data.data[0].b64_json;

    const generatedDir = getGeneratedDir();
    await mkdir(generatedDir, { recursive: true });
    const timestamp = Date.now();
    const format = settings?.output_format || 'png';
    const filename = `pudding-openai-${timestamp}.${format}`;
    const filepath = join(generatedDir, filename);

    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filepath, buffer);

    const imageUrl = makeGeneratedUrl(filename);

    return NextResponse.json({
      success: true,
      imageUrl,
      revisedPrompt: data.data?.[0]?.revised_prompt,
      provider: 'pudding-openai',
    });

  } catch (error: any) {
    console.error('[Pudding OpenAI Generate Error]', error);

    if (error.message?.includes('401') || error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Invalid Pudding API key' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Image generation failed' },
      { status: 500 }
    );
  }
}
