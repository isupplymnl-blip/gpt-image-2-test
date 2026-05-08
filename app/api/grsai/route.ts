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

        if (!prompt || typeof prompt !== 'string') {
          send('error', { error: 'Prompt is required' });
          controller.close();
          return;
        }

        const apiKey = process.env.GRSAI_API_KEY;
        if (!apiKey) {
          send('error', { error: 'GRSAI_API_KEY not set' });
          controller.close();
          return;
        }

        // Convert reference images to base64 data URLs (grsAI images[] is string[])
        const imageRefs: string[] = [];
        for (const url of refs) {
          try {
            imageRefs.push(await toBase64(url));
          } catch (err) {
            console.warn('[grsai] Failed to load reference image:', url, err instanceof Error ? err.message : err);
          }
        }

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

        console.log(`[grsai] POST ${GRSAI_BASE}/v1/api/generate model=${model} refs=${refs.length} size=${aspectRatio}`);

        // Heartbeat while waiting for slow generation (30-60s)
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch { /* closed */ }
        }, 15_000);

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

        const responseText = await response.text();

        if (!response.ok) {
          console.error('[grsai] API error', response.status, responseText);
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
          send('error', { error: `GrsAI returned non-JSON: ${responseText.slice(0, 200)}` });
          controller.close();
          return;
        }

        console.log(`[grsai] response status=${parsed.status} id=${parsed.id}`);

        if (parsed.status === 'violation') {
          send('error', { error: 'Content policy violation' });
          controller.close();
          return;
        }

        if (parsed.status === 'failed') {
          send('error', { error: parsed.error ?? 'Generation failed' });
          controller.close();
          return;
        }

        const cdnUrl = parsed.results?.[0]?.url;
        if (!cdnUrl) {
          send('error', { error: `No image URL in GrsAI response (status: ${parsed.status})` });
          controller.close();
          return;
        }

        // Download CDN image and save locally
        const imgRes = await fetch(cdnUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image from CDN: ${imgRes.status}`);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());

        const generatedDir = getGeneratedDir();
        await mkdir(generatedDir, { recursive: true });
        const filename = `grsai-${Date.now()}.png`;
        await writeFile(join(generatedDir, filename), imgBuf);
        const imageUrl = makeGeneratedUrl(filename);

        send('complete', { imageUrl });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[grsai] error:', message);
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
