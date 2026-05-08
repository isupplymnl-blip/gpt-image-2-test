#!/usr/bin/env node
/**
 * Test 24: packyapi "edit" via /v1/images/generations + JSON `images` array.
 * Uses a hosted URL ref (not base64) to keep the request small + within
 * undici's headers-timeout. Pattern matches grsai's route handler exactly:
 * grsai/route.ts:124-128 (POST /v1/images/generations, body.images = [...]).
 *
 * Usage:
 *   node tools/scrape-tests/24-packyapi-edit-via-gen.mjs [<image-url-or-png-path>]
 *   - default: reads newest packyapi-miyuri-*.json log for `url` field
 *   - if arg is a URL → use as image_url
 *   - if arg is a .png path → fall back to base64 data URL (slower but offline-friendly)
 *
 * Env: SIZE=1024x1536  QUALITY=high  MODEL=gpt-image-2
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';
import { join } from 'node:path';

// Bump undici timeouts — gen takes 3-5 min, default headers timeout is 5min total.
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

const KEY = process.env.PACKY_KEY ?? 'sk-fAoUs0q535gcMhNYToq0ftBhzgQi8i3P8K3MwkF9JPZVNfG1';
const BASE = process.env.PACKY_BASE ?? 'https://www.packyapi.com';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1024';
const QUALITY = process.env.QUALITY ?? 'low';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

function newestUrl() {
  const files = readdirSync(OUT)
    .filter(f => f.startsWith('packyapi-miyuri-') && f.endsWith('.json'))
    .map(f => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const { f } of files) {
    try {
      const j = JSON.parse(readFileSync(join(OUT, f), 'utf8'));
      if (j.url) return j.url;
      const m = (j.bodyHead ?? '').match(/"url"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

const arg = process.argv[2];
let imageRef;
if (!arg) {
  imageRef = newestUrl();
  if (!imageRef) { console.error('no url found in testoutput; pass a URL or PNG path as arg'); process.exit(1); }
  console.log(`[ref url] ${imageRef}`);
} else if (/^https?:/.test(arg)) {
  imageRef = arg;
  console.log(`[ref url] ${imageRef}`);
} else {
  const buf = readFileSync(arg);
  imageRef = `data:image/png;base64,${buf.toString('base64')}`;
  console.log(`[ref b64] ${arg} (${buf.length} bytes → b64 ${imageRef.length} chars)`);
}

const PROMPT = `Image 1 = previous shot of subject. Same woman, same ivory sheer organza babydoll, same hair, same pose, same expression. RELOCATE her to a luxury marble bathroom interior — large slab of veined Calacatta marble wall behind, polished marble floor reflecting warm light, freestanding sculptural soaking tub partially visible camera-left, single warm tungsten sconce camera-right at shoulder height, 2700K, soft amber light grazing the marble and the sheer organza. Keep cinematic shadow falloff, keep deep shadow ratio, keep f/1.8 shallow depth of field, keep 85mm framing head to knee. Photorealism, Vogue Japan editorial grade. No text, no watermarks.`;

const url = `${BASE}/v1/images/generations`;
const body = {
  model: MODEL,
  prompt: PROMPT,
  size: SIZE,
  quality: QUALITY,
  n: 1,
  moderation: 'low',
  images: [{ image_url: imageRef }],
};

console.log(`[edit-via-gen] POST ${url}  size=${SIZE} quality=${QUALITY}`);
const t0 = Date.now();
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const txt = await res.text();
const elapsed = Date.now() - t0;
const ct = res.headers.get('content-type') ?? '';
console.log(`[gen+images] HTTP ${res.status} ${ct} ${elapsed}ms bytes=${txt.length}`);

let parsed = null;
try { parsed = JSON.parse(txt); } catch {}
const log = {
  stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY,
  refKind: imageRef.startsWith('data:') ? 'b64' : 'url',
  ref: imageRef.startsWith('data:') ? `b64(${imageRef.length})` : imageRef,
  http: res.status, ct, elapsed, bytes: txt.length,
  bodyHead: txt.slice(0, 800),
};

if (!res.ok) {
  console.log(`[fail] ${txt.slice(0, 800)}`);
  writeFileSync(join(OUT, `packyapi-edit-via-gen-${STAMP}.json`), JSON.stringify(log, null, 2));
  process.exit(1);
}

const item = parsed?.data?.[0];
if (item?.b64_json) {
  const out = Buffer.from(item.b64_json, 'base64');
  const file = join(OUT, `packyapi-edit-bathroom-${STAMP}.png`);
  writeFileSync(file, out);
  console.log(`[saved b64] → ${file} (${out.length} bytes)`);
  log.saved = file;
} else if (item?.url) {
  console.log(`[url] ${item.url}`);
  if (item.revised_prompt) console.log(`[revised] ${item.revised_prompt.slice(0, 240)}`);
  const dl = await fetch(item.url);
  if (dl.ok) {
    const out = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `packyapi-edit-bathroom-${STAMP}.png`);
    writeFileSync(file, out);
    console.log(`[saved url] → ${file} (${out.length} bytes)`);
    log.saved = file;
    log.url = item.url;
    log.revised_prompt = item.revised_prompt;
  }
}

writeFileSync(join(OUT, `packyapi-edit-via-gen-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/packyapi-edit-via-gen-${STAMP}.json`);
