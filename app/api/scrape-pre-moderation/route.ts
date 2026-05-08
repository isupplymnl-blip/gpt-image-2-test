/**
 * Pre-moderation frame scraper
 *
 * POSTs to OpenAI image generation with stream=true + partial_images=N, and
 * assembles every partial SSE frame. Useful when the final image is blocked
 * by moderation — the last partial frame is the pre-moderation output.
 *
 * Request JSON:
 *   {
 *     prompt: string,
 *     settings?: Record<string, unknown>,
 *     referenceImages?: Array<{ url, name, role? } | string>,
 *     referenceUrls?: string[],
 *     partialImages?: number,               // 1..3, default 3
 *     keepAllFrames?: boolean,
 *     forceEdits?: boolean,                 // use /v1/images/edits w/ transparent pixel
 *   }
 *
 * Query:
 *   ?format=blob|json  (default json)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGeneratedDir, makeGeneratedUrl, urlToFilePath } from '../../lib/storage';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { resolveOpenAISize } from '../../lib/openaiSizeResolver';
import { scrapeOpenAI, TRANSPARENT_PIXEL_DATA_URL } from '../../lib/openaiScrape';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function roleLabel(role?: string): string {
  if (role === 'model') return 'model reference';
  if (role === 'product') return 'product reference';
  if (role === 'setting') return 'setting reference';
  if (role === 'style') return 'style reference';
  return 'reference image';
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

async function persistB64(b64: string, filename: string): Promise<string> {
  const dir = getGeneratedDir();
  await mkdir(dir, { recursive: true });
  const filepath = join(dir, filename);
  await writeFile(filepath, Buffer.from(b64, 'base64'));
  return makeGeneratedUrl(filename);
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const preferBlob = ['blob', 'image'].includes((url.searchParams.get('format') ?? 'json').toLowerCase());

    const body = await req.json();
    const {
      prompt, settings, referenceImages, referenceUrls,
      partialImages, keepAllFrames, forceEdits,
      provider,
    } = body as {
      prompt: string;
      settings?: Record<string, unknown>;
      referenceImages?: Array<{ url: string; name: string; role?: string } | string>;
      referenceUrls?: string[];
      partialImages?: number;
      keepAllFrames?: boolean;
      forceEdits?: boolean;
      provider?: 'openai' | 'grsai';
    };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const useGrsai = provider === 'grsai';
    const apiKey = useGrsai ? process.env.GRSAI_API_KEY : process.env.OPENAI_API_KEY;
    const baseUrl = useGrsai
      ? (process.env.GRSAI_BASE_URL ?? 'https://grsaiapi.com')
      : 'https://api.openai.com';
    if (!apiKey) {
      return NextResponse.json(
        { error: useGrsai ? 'GRSAI_API_KEY not set' : 'OPENAI_API_KEY not set' },
        { status: 500 },
      );
    }

    const rawRefs = (referenceImages || referenceUrls || []) as Array<{ url: string; name: string; role?: string } | string>;
    const refs = rawRefs.map(r => (typeof r === 'string' ? r : r.url));

    const imageRefs: Array<{ image_url: string }> = [];
    for (const u of refs) {
      try {
        const { data, mimeType } = await toBase64(u);
        imageRefs.push({ image_url: `data:${mimeType};base64,${data}` });
      } catch (err) {
        console.warn('[scrape-pre-mod] ref load fail', u, err instanceof Error ? err.message : err);
      }
    }

    const useEdits = imageRefs.length > 0 || forceEdits;
    if (forceEdits && imageRefs.length === 0) imageRefs.push({ image_url: TRANSPARENT_PIXEL_DATA_URL });

    let enrichedPrompt = prompt;
    if (imageRefs.length > 0 && !prompt.includes('Image 1')) {
      const parts = rawRefs.map((r, i) => `Image ${i + 1} = ${roleLabel(typeof r === 'string' ? undefined : r.role)}`);
      if (parts.length) enrichedPrompt = `${parts.join(', ')}.\n${prompt}`;
    }

    const model = (settings?.model as string | undefined) ?? 'gpt-image-2';
    const resolvedSize = resolveOpenAISize(
      settings?.imageSize as string | undefined,
      settings?.aspectRatio as string | undefined,
      settings?.size as string | undefined,
    );

    const result = await scrapeOpenAI({
      apiKey,
      baseUrl,
      prompt: enrichedPrompt,
      model,
      size: resolvedSize,
      quality: settings?.quality as string | undefined,
      background: settings?.background as string | undefined,
      moderation: (settings?.moderation as 'auto' | 'low' | undefined) ?? 'low',
      output_format: settings?.output_format as string | undefined,
      output_compression: settings?.output_compression as number | undefined,
      n: settings?.n as number | undefined,
      partialImages: partialImages ?? 3,
      imageRefs: imageRefs.length ? imageRefs : undefined,
      forceEndpoint: useEdits ? 'edits' : 'generations',
      retryOn400ContentPolicy: useGrsai ? 5 : 0,
    });

    const { frames, finalB64, revisedPrompt, blockReason, blocked } = result;
    const timestamp = Date.now();
    const format = (settings?.output_format as string | undefined) || 'png';

    const framesToPersist = keepAllFrames ? frames : frames.slice(-1);
    const persistedFrames: Array<{ index: number; url: string }> = [];
    for (const f of framesToPersist) {
      const fname = `scrape-frame-${timestamp}-${f.index}.${format}`;
      persistedFrames.push({ index: f.index, url: await persistB64(f.b64, fname) });
    }

    let finalImageUrl: string | null = null;
    if (finalB64) finalImageUrl = await persistB64(finalB64, `scrape-final-${timestamp}.${format}`);

    const preModerationImageUrl = persistedFrames.length ? persistedFrames[persistedFrames.length - 1].url : null;

    console.log(`[scrape-pre-mod] frames=${frames.length} final=${!!finalImageUrl} blocked=${blocked} endpoint=${result.endpoint}`);

    if (preferBlob) {
      const chosen = finalB64 ?? (frames.length ? frames[frames.length - 1].b64 : null);
      if (!chosen) {
        return NextResponse.json({ ok: false, error: 'No frames received', blocked: true, blockReason }, { status: 502 });
      }
      const buf = Buffer.from(chosen, 'base64');
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(buf.length),
          'Cache-Control': 'no-store',
          'X-Scrape-Blocked': String(blocked),
          'X-Scrape-Frame-Count': String(frames.length),
          'X-Scrape-Source': blocked ? 'pre-moderation-partial' : 'final',
          ...(revisedPrompt ? { 'X-Revised-Prompt': encodeURIComponent(revisedPrompt) } : {}),
          ...(blockReason ? { 'X-Block-Reason': encodeURIComponent(blockReason) } : {}),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      finalImageUrl,
      preModerationImageUrl,
      frames: persistedFrames,
      frameCount: frames.length,
      revisedPrompt,
      blocked,
      blockReason,
      endpoint: result.endpoint,
      provider: useGrsai ? 'grsai' : 'openai',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scrape-pre-mod] fatal', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
