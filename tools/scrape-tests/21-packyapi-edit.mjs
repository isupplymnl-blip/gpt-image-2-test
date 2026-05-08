#!/usr/bin/env node
/**
 * Test 21: packyapi.com /v1/images/edits — feed the gen output back in,
 * change the location (bedroom → marble bathroom), keep subject + outfit.
 *
 * Usage:
 *   node tools/scrape-tests/21-packyapi-edit.mjs <input-png>
 * If no arg: picks newest packyapi-miyuri-*.png in testoutput/.
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env.PACKY_KEY ?? 'sk-fAoUs0q535gcMhNYToq0ftBhzgQi8i3P8K3MwkF9JPZVNfG1';
const BASE = process.env.PACKY_BASE ?? 'https://www.packyapi.com';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1536';
const QUALITY = process.env.QUALITY ?? 'high';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

function newestPackyPng() {
  const files = readdirSync(OUT)
    .filter(f => f.startsWith('packyapi-miyuri-') && f.endsWith('.png'))
    .map(f => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files[0] ? join(OUT, files[0].f) : null;
}

const INPUT = process.argv[2] ?? newestPackyPng();
if (!INPUT) { console.error('no input png. pass path arg or run 20-packyapi-miyuri.mjs first.'); process.exit(1); }
console.log(`[input] ${INPUT}`);
const buf = readFileSync(INPUT);

const EDIT_PROMPT = `Same woman, same ivory sheer organza babydoll, same hair, same pose, same expression. RELOCATE her to a luxury marble bathroom interior — large slab of veined Calacatta marble wall behind, polished marble floor reflecting warm light, freestanding sculptural soaking tub partially visible camera-left, single warm tungsten sconce camera-right at shoulder height, 2700K, soft amber light grazing the marble and the sheer organza. Keep cinematic shadow falloff, keep deep shadow ratio, keep f/1.8 shallow depth of field, keep 85mm framing head to knee. Photorealism, Vogue Japan editorial grade. No text, no watermarks.`;

const fd = new FormData();
fd.append('model', MODEL);
fd.append('prompt', EDIT_PROMPT);
fd.append('size', SIZE);
fd.append('quality', QUALITY);
fd.append('n', '1');
fd.append('image', new Blob([buf], { type: 'image/png' }), 'input.png');

console.log(`[edit] POST ${BASE}/v1/images/edits  model=${MODEL} size=${SIZE} quality=${QUALITY}`);
const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/edits`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}` },
  body: fd,
});
const txt = await res.text();
const elapsed = Date.now() - t0;
const ct = res.headers.get('content-type') ?? '';
console.log(`[edit] HTTP ${res.status} ${ct} ${elapsed}ms bytes=${txt.length}`);

let parsed = null;
try { parsed = JSON.parse(txt); } catch {}
const log = {
  stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY,
  input: INPUT, http: res.status, ct, elapsed, bytes: txt.length,
  bodyHead: txt.slice(0, 800),
  parsedKeys: parsed ? Object.keys(parsed) : null,
};

if (!res.ok) {
  console.log(`[fail] ${txt.slice(0, 600)}`);
  writeFileSync(join(OUT, `packyapi-edit-${STAMP}.json`), JSON.stringify(log, null, 2));
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
  const dl = await fetch(item.url);
  if (dl.ok) {
    const out = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `packyapi-edit-bathroom-${STAMP}.png`);
    writeFileSync(file, out);
    console.log(`[saved url] → ${file} (${out.length} bytes)`);
    log.saved = file;
    log.url = item.url;
  }
} else {
  console.log(`[no image] body:\n${txt.slice(0, 1200)}`);
}

writeFileSync(join(OUT, `packyapi-edit-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/packyapi-edit-${STAMP}.json`);
