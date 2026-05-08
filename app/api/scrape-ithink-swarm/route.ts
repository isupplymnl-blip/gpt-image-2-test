/**
 * POST /api/scrape-ithink-swarm
 *
 * iThink stochastic swarm scraper. iThink's content moderation is inconsistent
 * on borderline prompts — same prompt can succeed 8/10 times, fail 2/10.
 * This route fires N parallel requests and returns the first success.
 *
 * Failure modes iThink returns:
 *   - "违反平台政策" → prompt-stage block (100% rate on truly flagged prompts)
 *   - "没有按照预期生成图片" → post-gen block (inconsistent; retries help)
 *   - HTTP 524 → Cloudflare timeout (retryable)
 *
 * Body JSON:
 *   {
 *     prompt: string,
 *     settings?: { model, size/aspectRatio/imageSize, quality, moderation, output_format, ... },
 *     referenceImages?: Array<{ url, name, role? } | string>,
 *     referenceUrls?: string[],
 *     swarmSize?: number,        // default 5, max 20
 *     stopOnFirst?: boolean,     // default true — save cost
 *     budgetMs?: number,         // default 120_000, cap total wall time
 *   }
 *
 * Response JSON:
 *   {
 *     ok: boolean,
 *     successes: number,
 *     failures: number,
 *     breakdown: { promptBlocks, postGenBlocks, timeouts, other },
 *     firstSuccessMs: number | null,
 *     imageUrl: string | null,       // local URL of saved image
 *     revisedPrompt?: string,
 *     attempts: Array<{ i, http, elapsedMs, error? }>,
 *   }
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

async function toBase64(urlOrPath: string): Promise<Buffer> {
  let inputBuf: Buffer;
  if (urlOrPath.startsWith('/')) {
    inputBuf = await readFile(urlToFilePath(urlOrPath));
  } else {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`fetch ref ${res.status}`);
    inputBuf = Buffer.from(await res.arrayBuffer());
  }
  return sharp(inputBuf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

type Attempt = {
  i: number;
  http: number;
  elapsedMs: number;
  status: 'success' | 'prompt-block' | 'post-gen-block' | 'timeout' | 'other';
  error?: string;
  url?: string;
  b64?: string;
  revisedPrompt?: string;
};

function classifyError(body: string, http: number): Attempt['status'] {
  if (http === 524) return 'timeout';
  if (/违反平台政策|violates|content policy/i.test(body)) return 'prompt-block';
  if (/没有按照预期生成|不符合|didn't generate|did not generate|generate failed|generation failed/i.test(body)) return 'post-gen-block';
  if (http >= 500) return 'other';
  return 'other';
}

async function fireOne(
  i: number,
  baseUrl: string,
  apiKey: string,
  useEdits: boolean,
  buildBody: () => BodyInit,
  headers: Record<string, string>,
  endpoint: string,
): Promise<Attempt> {
  const t0 = Date.now();
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 95_000);
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST', headers, body: buildBody(), signal: ac.signal,
    });
    clearTimeout(timeout);
    const elapsedMs = Date.now() - t0;
    const txt = await res.text();
    let parsed: { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>; error?: { message?: string } } | null = null;
    try { parsed = JSON.parse(txt); } catch { /* */ }

    if (res.ok && parsed?.data?.[0]) {
      const item = parsed.data[0];
      if (item.b64_json) return { i, http: res.status, elapsedMs, status: 'success', b64: item.b64_json, revisedPrompt: item.revised_prompt };
      if (item.url) {
        try {
          const dl = await fetch(item.url);
          if (dl.ok) {
            const buf = Buffer.from(await dl.arrayBuffer());
            return { i, http: res.status, elapsedMs, status: 'success', b64: buf.toString('base64'), url: item.url, revisedPrompt: item.revised_prompt };
          }
        } catch { /* */ }
      }
    }

    return {
      i, http: res.status, elapsedMs,
      status: classifyError(txt, res.status),
      error: parsed?.error?.message ?? txt.slice(0, 200),
    };
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : 'throw';
    return { i, http: 0, elapsedMs: Date.now() - t0, status: msg.includes('abort') ? 'timeout' : 'other', error: msg };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt, settings, referenceImages, referenceUrls,
      swarmSize = 5, stopOnFirst = true, budgetMs = 120_000,
    } = body as {
      prompt: string;
      settings?: Record<string, unknown>;
      referenceImages?: Array<{ url: string; name: string; role?: string } | string>;
      referenceUrls?: string[];
      swarmSize?: number;
      stopOnFirst?: boolean;
      budgetMs?: number;
    };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    const apiKey = process.env.ITHINK_OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ITHINK_OPENAI_API_KEY not set' }, { status: 500 });
    const baseUrl = (process.env.ITHINK_OPENAI_BASE_URL ?? 'https://token.ithinkai.cn').replace(/\/$/, '');

    const N = Math.max(1, Math.min(20, swarmSize));

    // Load refs
    const rawRefs = (referenceImages || referenceUrls || []) as Array<{ url: string; name: string; role?: string } | string>;
    const refs = rawRefs.map(r => (typeof r === 'string' ? r : r.url));
    const refBuffers: Buffer[] = [];
    for (const u of refs) {
      try { refBuffers.push(await toBase64(u)); }
      catch (e) { console.warn('[swarm] ref load fail', u, e instanceof Error ? e.message : e); }
    }
    const useEdits = refBuffers.length > 0;

    let finalPrompt = prompt;
    if (useEdits && !prompt.includes('Image 1')) {
      const parts = rawRefs.map((r, i) => `Image ${i + 1} = ${roleLabel(typeof r === 'string' ? undefined : r.role)}`);
      finalPrompt = `${parts.join(', ')}.\n${prompt}`;
    }

    const model = (settings?.model as string | undefined) ?? 'gpt-image-2';
    const resolvedSize = resolveOpenAISize(
      settings?.imageSize as string | undefined,
      settings?.aspectRatio as string | undefined,
      settings?.size as string | undefined,
    );
    const openaiSettings: Record<string, unknown> = {
      ...(resolvedSize !== undefined ? { size: resolvedSize } : {}),
      ...(settings?.quality !== undefined ? { quality: settings.quality } : {}),
      ...(settings?.moderation !== undefined ? { moderation: settings.moderation } : { moderation: 'low' }),
      ...(settings?.output_format !== undefined ? { output_format: settings.output_format } : {}),
      ...(settings?.background !== undefined ? { background: settings.background } : {}),
    };

    let headers: Record<string, string>;
    let buildBody: () => BodyInit;
    let endpoint: string;

    if (useEdits) {
      endpoint = '/v1/images/edits';
      headers = { 'Authorization': `Bearer ${apiKey}` };
      buildBody = () => {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', finalPrompt);
        for (const [k, v] of Object.entries(openaiSettings)) form.append(k, String(v));
        for (let i = 0; i < refBuffers.length; i++) {
          form.append('image', new Blob([refBuffers[i] as unknown as ArrayBuffer], { type: 'image/png' }), `ref-${i}.png`);
        }
        return form;
      };
    } else {
      endpoint = '/v1/images/generations';
      headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
      buildBody = () => JSON.stringify({ model, prompt: finalPrompt, ...openaiSettings });
    }

    console.log(`[swarm] firing ${N} parallel iThink requests, endpoint=${endpoint}, stopOnFirst=${stopOnFirst}`);

    const tStart = Date.now();
    const attempts: Attempt[] = [];
    let firstSuccess: Attempt | null = null;
    // Fire all at once, race them
    const promises = Array.from({ length: N }, (_, i) =>
      fireOne(i, baseUrl, apiKey, useEdits, buildBody, headers, endpoint),
    );

    // If stopOnFirst, track manually and abort remaining once one wins.
    // Simple approach: await each but short-circuit.
    const budgetAc = new AbortController();
    const budgetTimer = setTimeout(() => budgetAc.abort(), budgetMs);

    await new Promise<void>((resolve) => {
      let pending = N;
      let resolved = false;
      for (const p of promises) {
        p.then((att) => {
          attempts.push(att);
          console.log(`[swarm] attempt ${att.i} → ${att.status} (${att.elapsedMs}ms) ${att.error ? '— ' + att.error.slice(0, 80) : ''}`);
          if (att.status === 'success' && !firstSuccess) {
            firstSuccess = att;
            if (stopOnFirst && !resolved) { resolved = true; resolve(); }
          }
          if (--pending === 0 && !resolved) { resolved = true; resolve(); }
        });
      }
      budgetAc.signal.addEventListener('abort', () => { if (!resolved) { resolved = true; resolve(); } });
    });
    clearTimeout(budgetTimer);

    const elapsedMs = Date.now() - tStart;

    // Count breakdown
    const breakdown = {
      promptBlocks: attempts.filter(a => a.status === 'prompt-block').length,
      postGenBlocks: attempts.filter(a => a.status === 'post-gen-block').length,
      timeouts: attempts.filter(a => a.status === 'timeout').length,
      other: attempts.filter(a => a.status === 'other').length,
    };
    const successes = attempts.filter(a => a.status === 'success').length;
    const failures = attempts.filter(a => a.status !== 'success').length;

    const winner = firstSuccess as Attempt | null;

    // Persist winner
    let imageUrl: string | null = null;
    if (winner?.b64) {
      const dir = getGeneratedDir();
      await mkdir(dir, { recursive: true });
      const filename = `ithink-swarm-${Date.now()}.png`;
      await writeFile(join(dir, filename), Buffer.from(winner.b64, 'base64'));
      imageUrl = makeGeneratedUrl(filename);
    }

    console.log(`[swarm] done in ${elapsedMs}ms — successes=${successes}/${N}, breakdown=${JSON.stringify(breakdown)}`);

    return NextResponse.json({
      ok: successes > 0,
      provider: 'ithink',
      swarmSize: N,
      elapsedMs,
      successes,
      failures,
      breakdown,
      firstSuccessMs: winner?.elapsedMs ?? null,
      imageUrl,
      revisedPrompt: winner?.revisedPrompt,
      attempts: attempts.map(a => ({ i: a.i, http: a.http, elapsedMs: a.elapsedMs, status: a.status, error: a.error?.slice(0, 200) })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[swarm] fatal', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
