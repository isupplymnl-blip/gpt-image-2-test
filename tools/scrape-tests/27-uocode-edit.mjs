#!/usr/bin/env node
/**
 * Test 27: uocode.com — edit-via-gen.
 * /v1/images/generations + JSON `images: [{image_url}]` reference.
 * Accepts URL OR PNG path as arg (path → base64 data URL).
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';
import { join } from 'node:path';
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

const KEY = process.env.UOCODE_KEY ?? 'sk-NpwmON4KNrmRWJGU7K42SQEQ3IIVBr6srvCAxV8v7q6HRzi6';
const BASE = process.env.UOCODE_BASE ?? 'https://www.uocode.com';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1536';
const QUALITY = process.env.QUALITY ?? 'high';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

function newestPng(prefix) {
  const files = readdirSync(OUT)
    .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
    .map(f => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? join(OUT, files[0].f) : null;
}

const arg = process.argv[2];
let imageRef;
if (arg && /^https?:/.test(arg)) {
  imageRef = arg;
  console.log(`[ref url] ${imageRef}`);
} else {
  const path = arg ?? newestPng('uocode-japan-') ?? newestPng('uocode-vietnam-');
  if (!path) { console.error('no png found; pass URL or PNG path as arg, or run 25 first'); process.exit(1); }
  const buf = readFileSync(path);
  imageRef = `data:image/png;base64,${buf.toString('base64')}`;
  console.log(`[ref b64] ${path} (${buf.length} bytes → b64 ${imageRef.length} chars)`);
}

const PROMPT = `Image 1 = previous shot of subject. Same woman, same ivory silk chiffon slip dress, same hair, same pose, same expression. RELOCATE her to a luxury marble bathroom interior — large slab of veined Calacatta marble wall behind, polished marble floor reflecting warm light, freestanding sculptural soaking tub partially visible camera-left, single warm tungsten sconce camera-right at shoulder height, 2700K, soft amber light grazing the marble and the chiffon. Keep cinematic shadow falloff, deep shadow ratio, f/1.8 shallow depth of field, 85mm framing head to knee. Photorealism, Vogue Japan editorial grade. No text, no watermarks.`;

const url = `${BASE}/v1/images/generations`;
const body = {
  model: MODEL, prompt: PROMPT, size: SIZE, quality: QUALITY, n: 1,
  moderation: 'low', images: [{ image_url: imageRef }],
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

let parsed = null; try { parsed = JSON.parse(txt); } catch {}
const log = {
  stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY,
  refKind: imageRef.startsWith('data:') ? 'b64' : 'url',
  ref: imageRef.startsWith('data:') ? `b64(${imageRef.length})` : imageRef,
  http: res.status, ct, elapsed, bytes: txt.length, bodyHead: txt.slice(0, 800),
};

if (!res.ok) {
  console.log(`[fail] ${txt.slice(0, 800)}`);
  writeFileSync(join(OUT, `uocode-edit-${STAMP}.json`), JSON.stringify(log, null, 2));
  process.exit(1);
}

const item = parsed?.data?.[0];
if (item?.b64_json) {
  const buf = Buffer.from(item.b64_json, 'base64');
  const file = join(OUT, `uocode-edit-bathroom-${STAMP}.png`);
  writeFileSync(file, buf);
  console.log(`[saved b64] → ${file} (${buf.length} bytes)`);
  log.saved = file;
} else if (item?.url) {
  console.log(`[url] ${item.url}`);
  if (item.revised_prompt) console.log(`[revised] ${item.revised_prompt.slice(0, 200)}`);
  const dl = await fetch(item.url);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `uocode-edit-bathroom-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`[saved url] → ${file} (${buf.length} bytes)`);
    log.saved = file; log.url = item.url; log.revised_prompt = item.revised_prompt;
  }
}

writeFileSync(join(OUT, `uocode-edit-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/uocode-edit-${STAMP}.json`);
