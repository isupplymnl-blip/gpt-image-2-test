/**
 * POST /api/scrape-grsai
 *
 * Pre-moderation scraper using GrsAI's native async-polling endpoint.
 * Wins the race between (A) URL appearing in /v1/api/result and
 * (B) moderation flipping status to "violation".
 *
 * Body JSON:
 *   {
 *     prompt: string,
 *     model?: 'gpt-image-2' | 'gpt-image-2-vip',
 *     aspectRatio?: string,            // e.g. "1024x1024", "1774x887"
 *     referenceImages?: Array<{ url, name, role? } | string>,
 *     referenceUrls?: string[],
 *     pollIntervalMs?: number,         // default 250
 *     maxWaitMs?: number,              // default 180000
 *     captureAllRevisions?: boolean,
 *   }
 *
 * Query ?format=blob returns the raw image bytes instead of JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { getGeneratedDir, makeGeneratedUrl, urlToFilePath } from '../../lib/storage';
import { scrapeGrsai } from '../../lib/grsaiScrape';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function toBase64DataUrl(urlOrPath: string): Promise<string> {
  let inputBuf: Buffer;
  if (urlOrPath.startsWith('/')) {
    inputBuf = await readFile(urlToFilePath(urlOrPath));
  } else {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`fetch ref ${res.status}`);
    inputBuf = Buffer.from(await res.arrayBuffer());
  }
  const out = await sharp(inputBuf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${out.toString('base64')}`;
}

async function persistB64(b64: string, filename: string): Promise<string> {
  const dir = getGeneratedDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(b64, 'base64'));
  return makeGeneratedUrl(filename);
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const preferBlob = ['blob', 'image'].includes((url.searchParams.get('format') ?? 'json').toLowerCase());

    const body = await req.json();
    const {
      prompt, model, aspectRatio, referenceImages, referenceUrls,
      pollIntervalMs, maxWaitMs, captureAllRevisions,
    } = body as {
      prompt: string;
      model?: string;
      aspectRatio?: string;
      referenceImages?: Array<{ url: string; name: string; role?: string } | string>;
      referenceUrls?: string[];
      pollIntervalMs?: number;
      maxWaitMs?: number;
      captureAllRevisions?: boolean;
    };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GRSAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GRSAI_API_KEY not set' }, { status: 500 });
    const baseUrl = process.env.GRSAI_BASE_URL ?? 'https://grsaiapi.com';

    // Load refs → data URLs
    const rawRefs = (referenceImages || referenceUrls || []) as Array<{ url: string; name: string; role?: string } | string>;
    const refs = rawRefs.map(r => (typeof r === 'string' ? r : r.url));
    const loadedRefs: string[] = [];
    for (const u of refs) {
      try { loadedRefs.push(await toBase64DataUrl(u)); }
      catch (e) { console.warn('[scrape-grsai] ref load fail', u, e instanceof Error ? e.message : e); }
    }

    const result = await scrapeGrsai({
      apiKey,
      baseUrl,
      prompt,
      model: model ?? 'gpt-image-2',
      aspectRatio: aspectRatio ?? '1024x1024',
      images: loadedRefs.length ? loadedRefs : undefined,
      pollIntervalMs: pollIntervalMs ?? 250,
      maxWaitMs: maxWaitMs ?? 180_000,
      captureAllRevisions: captureAllRevisions ?? false,
    });

    console.log(`[scrape-grsai] task=${result.taskId} status=${result.finalStatus} preModUrl=${!!result.preModerationUrl} b64=${!!result.preModerationB64} polls=${result.pollCount}`);

    // Persist the downloaded image
    let savedUrl: string | null = null;
    if (result.preModerationB64) {
      const ts = Date.now();
      savedUrl = await persistB64(result.preModerationB64, `grsai-scrape-${ts}.png`);
    }

    if (preferBlob) {
      if (!result.preModerationB64) {
        return NextResponse.json(
          { ok: false, error: 'No image recovered', result },
          { status: 502 },
        );
      }
      const buf = Buffer.from(result.preModerationB64, 'base64');
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(buf.length),
          'Cache-Control': 'no-store',
          'X-Grsai-Task-Id': result.taskId ?? '',
          'X-Grsai-Final-Status': result.finalStatus,
          'X-Grsai-First-Url-Ms': String(result.firstUrlAfterMs ?? -1),
          'X-Grsai-Poll-Count': String(result.pollCount),
          'X-Grsai-Blocked': String(result.finalStatus !== 'succeeded'),
        },
      });
    }

    const blocked = result.finalStatus !== 'succeeded';
    return NextResponse.json({
      ok: !!result.preModerationB64,
      provider: 'grsai',
      taskId: result.taskId,
      finalStatus: result.finalStatus,
      blocked,
      preModerationImageUrl: savedUrl,
      preModerationSourceUrl: result.preModerationUrl,
      allUrls: result.allUrls,
      firstUrlAfterMs: result.firstUrlAfterMs,
      urlToFinalMs: result.urlToFinalMs,
      pollCount: result.pollCount,
      error: result.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scrape-grsai] fatal', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
