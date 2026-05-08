/**
 * OpenAI streaming image generation route — partial_images SSE
 * Emits:
 *   event: partial  data: { index, b64 }        (progressive preview)
 *   event: complete data: { imageUrl, revisedPrompt }
 *   event: error    data: { error }
 */

import { NextRequest } from 'next/server';
import { getGeneratedDir, makeGeneratedUrl } from '../../lib/storage';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { resolveOpenAISize } from '../../lib/openaiSizeResolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

async function toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/png' }> {
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
  return { data: outputBuf.toString('base64'), mimeType: 'image/png' };
}

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
        const refs    = rawRefs.map(r => (typeof r === 'string' ? r : r.url));
        const refNames = rawRefs.map(r => (typeof r === 'string' ? 'canvas-reference' : r.name));

        if (!prompt || typeof prompt !== 'string') {
          send('error', { error: 'Prompt is required' });
          controller.close();
          return;
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          send('error', { error: 'OPENAI_API_KEY not set' });
          controller.close();
          return;
        }

        // Convert reference images to base64 data URLs
        const imageRefs: Array<{ image_url: string }> = [];
        for (const url of refs) {
          try {
            const { data, mimeType } = await toBase64(url);
            imageRefs.push({ image_url: `data:${mimeType};base64,${data}` });
          } catch (err) {
            console.warn('[openai-stream] Failed to load reference image:', url, err instanceof Error ? err.message : err);
          }
        }

        const useEdits = imageRefs.length > 0;

        // Route-level fallback: inject Image N role labels when refs are present and the
        // Director hasn't already written them into the prompt (detected by "Image 1" absence).
        let enrichedPrompt = prompt;
        if (useEdits && !prompt.includes('Image 1')) {
          const labelParts = rawRefs.map((r, i) => `Image ${i + 1} = ${roleLabel(typeof r === 'string' ? undefined : r.role)}`);
          enrichedPrompt = `${labelParts.join(', ')}.\n${prompt}`;
        }

        const model = (settings?.model as string | undefined) ?? 'gpt-image-2';

        const resolvedSize = resolveOpenAISize(
          settings?.imageSize as string | undefined,
          settings?.aspectRatio as string | undefined,
          settings?.size as string | undefined,
        );

        const openaiSettings: Record<string, unknown> = {
          ...(resolvedSize !== undefined ? { size: resolvedSize } : {}),
          ...(settings?.quality      !== undefined ? { quality: settings.quality }      : {}),
          ...(settings?.n            !== undefined ? { n: settings.n }                  : {}),
          ...(settings?.background   !== undefined ? { background: settings.background } : {}),
          ...(settings?.output_format !== undefined ? { output_format: settings.output_format } : {}),
          ...(settings?.moderation   !== undefined ? { moderation: settings.moderation } : {}),
          ...(settings?.output_compression !== undefined ? { output_compression: settings.output_compression } : {}),
        };

        const endpoint = useEdits ? '/v1/images/edits' : '/v1/images/generations';

        const requestBody = {
          model,
          prompt: enrichedPrompt,
          ...(useEdits ? { images: imageRefs } : {}),
          ...openaiSettings,
          // streaming partial images — OpenAI expects an integer count, not an object
          stream: true,
          partial_images: 3,
        };

        console.log(`[openai-stream] POST ${endpoint} model=${model} refs=${refs.length}`);

        // Keep the SSE connection alive while waiting for OpenAI (proxies drop idle connections after ~30s)
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keep-alive\n\n')); } catch { /* closed */ }
        }, 15_000);

        let response: Response;
        try {
          response = await fetch(`https://api.openai.com${endpoint}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
        } finally {
          clearInterval(heartbeat);
        }

        if (!response.ok || !response.body) {
          const errorText = await response.text();
          console.error('[openai-stream] API error', response.status, errorText);

          // If the API doesn't support streaming for this endpoint, fall back gracefully
          if (response.status === 400 && errorText.includes('stream')) {
            send('error', { error: 'OpenAI streaming not supported for this request — use the standard route' });
          } else if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after') ?? response.headers.get('x-ratelimit-reset-images');
            send('error', { error: `Rate limit exceeded${retryAfter ? ` — retry after ${retryAfter}s` : ''}`, retryAfter });
          } else {
            send('error', { error: `OpenAI API error: ${response.status} ${errorText}` });
          }
          controller.close();
          return;
        }

        // Read the SSE stream from OpenAI
        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';
        let finalB64: string | null = null;
        let revisedPrompt: string | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;

            let parsed: {
              type?: string;
              index?: number;
              b64_json?: string;
              revised_prompt?: string;
              // OpenAI streaming image shape
              partial_images?: Array<{ index: number; b64_json: string }>;
              data?: Array<{ b64_json?: string; revised_prompt?: string }>;
            };
            try { parsed = JSON.parse(raw); } catch { continue; }

            // Handle partial_images events
            if (parsed.partial_images && Array.isArray(parsed.partial_images)) {
              for (const part of parsed.partial_images) {
                if (part.b64_json) {
                  send('partial', { index: part.index, b64: part.b64_json });
                  finalB64 = part.b64_json; // keep last for fallback
                }
              }
            }

            // Handle single partial image event (alternate format)
            if (parsed.type === 'partial_image' && parsed.b64_json) {
              send('partial', { index: parsed.index ?? 0, b64: parsed.b64_json });
              finalB64 = parsed.b64_json;
            }

            // Handle final image data event
            if (parsed.data && Array.isArray(parsed.data)) {
              for (const item of parsed.data) {
                if (item.b64_json) {
                  finalB64 = item.b64_json;
                  if (item.revised_prompt) revisedPrompt = item.revised_prompt;
                }
              }
            }

            // Handle direct b64_json at top level (some response shapes)
            if (parsed.b64_json && !parsed.type) {
              finalB64 = parsed.b64_json;
            }
            if (parsed.revised_prompt) revisedPrompt = parsed.revised_prompt;
          }
        }

        if (!finalB64) {
          send('error', { error: 'No image data received from OpenAI streaming response' });
          controller.close();
          return;
        }

        // Save final image to disk
        const generatedDir = getGeneratedDir();
        await mkdir(generatedDir, { recursive: true });
        const timestamp = Date.now();
        const format    = (settings?.output_format as string | undefined) || 'png';
        const filename  = `openai-stream-${timestamp}.${format}`;
        const filepath  = join(generatedDir, filename);

        const buffer2 = Buffer.from(finalB64, 'base64');
        await writeFile(filepath, buffer2);

        const imageUrl = makeGeneratedUrl(filename);

        send('complete', { imageUrl, revisedPrompt, provider: 'openai' });
        console.log(`[openai-stream] complete → ${imageUrl}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[openai-stream] error', msg);
        try {
          send('error', { error: msg });
        } catch { /* controller may be closed */ }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
