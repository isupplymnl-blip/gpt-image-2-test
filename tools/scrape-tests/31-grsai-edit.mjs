#!/usr/bin/env node
/**
 * Test 31: GrsAI image-edit via /v1/api/generate with reference images.
 * GrsAI does NOT expose OpenAI /v1/images/edits — its custom endpoint accepts
 * `images: string[]` (base64 data URLs) and treats them as references / edits.
 *
 * Goal: confirm subject identity is preserved when scene is changed.
 *
 * Usage: node tools/scrape-tests/31-grsai-edit.mjs [<png-path>]
 * Picks newest uocode-japan-/uocode-vietnam-/miyuri PNG from testoutput/ if no arg.
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';
import { join } from 'node:path';
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const KEY = env.GRSAI_API_KEY;
const BASE = (env.GRSAI_BASE_URL || 'https://grsaiapi.com').replace(/\/$/, '');
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1024';

if (!KEY) { console.error('GRSAI_API_KEY missing in .env.local'); process.exit(1); }

const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

function newestPng(prefix) {
  const files = readdirSync(OUT)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .map((f) => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? join(OUT, files[0].f) : null;
}

const arg = process.argv[2];
const INPUT = arg
  ?? newestPng('uocode-japan-')
  ?? newestPng('uocode-vietnam-')
  ?? newestPng('miyuri4-');
if (!INPUT) { console.error('no input png found'); process.exit(1); }
console.log(`[input] ${INPUT}`);
console.log(`[base]  ${BASE}/v1/api/generate  model=${MODEL}  size=${SIZE}`);

const buf = readFileSync(INPUT);
const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
console.log(`[ref]  ${INPUT.split(/[\\/]/).pop()} (${buf.length} bytes → ${dataUrl.length} chars b64)`);

const PROMPT = `Image 1 = subject reference photograph.
Keep the same person from Image 1 — same face, same hair, same outfit, same pose. Place her in a luxury marble bathroom interior: large veined Calacatta marble wall behind her, polished marble floor, freestanding sculptural soaking tub partially visible at left, single warm tungsten sconce at right, soft 2700K amber light. 85mm portrait framing, head to knee, shallow depth of field. Editorial photography. No text, no watermarks.`;

const requestBody = {
  model: MODEL,
  prompt: PROMPT,
  aspectRatio: SIZE,
  replyType: 'json',
  images: [dataUrl],
};

const t0 = Date.now();
let response;
try {
  response = await fetch(`${BASE}/v1/api/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
} catch (e) {
  console.log(`[fail fetch] ${Date.now() - t0}ms ${e.message}`);
  process.exit(1);
}

const elapsed = Date.now() - t0;
const ct = response.headers.get('content-type') || '';
console.log(`[resp] HTTP ${response.status} ${elapsed}ms ct=${ct}`);

const text = await response.text();
let data;
try { data = JSON.parse(text); } catch { data = null; }

if (!response.ok) {
  console.log(`[fail body] ${text.slice(0, 600)}`);
  writeFileSync(join(OUT, `grsai-edit-${STAMP}.json`), JSON.stringify({ stamp: STAMP, base: BASE, status: response.status, body: text, elapsed }, null, 2));
  process.exit(1);
}

console.log('[resp keys]', data ? Object.keys(data) : 'not-json');
const log = { stamp: STAMP, base: BASE, model: MODEL, size: SIZE, input: INPUT, elapsed, topKeys: data ? Object.keys(data) : null };

const candidates = [];
const walk = (v) => {
  if (!v) return;
  if (typeof v === 'string') {
    if (v.startsWith('http') || v.startsWith('data:image')) candidates.push(v);
    return;
  }
  if (Array.isArray(v)) { v.forEach(walk); return; }
  if (typeof v === 'object') Object.values(v).forEach(walk);
};
walk(data);

const url = candidates.find((c) => c.startsWith('http'));
const b64 = candidates.find((c) => c.startsWith('data:image'));

if (b64) {
  const m = b64.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (m) {
    const out = Buffer.from(m[1], 'base64');
    const file = join(OUT, `grsai-edit-bathroom-${STAMP}.png`);
    writeFileSync(file, out);
    console.log(`[saved b64] → ${file} (${out.length} bytes)`);
    log.saved = file;
  }
} else if (url) {
  console.log(`[url] ${url}`);
  const dl = await fetch(url);
  if (dl.ok) {
    const out = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `grsai-edit-bathroom-${STAMP}.png`);
    writeFileSync(file, out);
    console.log(`[saved url] → ${file} (${out.length} bytes)`);
    log.saved = file; log.url = url;
  } else {
    console.log(`[url fetch fail] HTTP ${dl.status}`);
  }
} else {
  console.log('[warn] no image url or b64 in response');
  log.raw_preview = text.slice(0, 1000);
}

writeFileSync(join(OUT, `grsai-edit-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/grsai-edit-${STAMP}.json`);
