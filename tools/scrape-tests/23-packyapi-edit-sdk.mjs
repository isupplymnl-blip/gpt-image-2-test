#!/usr/bin/env node
/**
 * Test 23: packyapi /v1/images/edits via OpenAI SDK (proper multipart).
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

const KEY = process.env.PACKY_KEY ?? 'sk-fAoUs0q535gcMhNYToq0ftBhzgQi8i3P8K3MwkF9JPZVNfG1';
const BASE = process.env.PACKY_BASE ?? 'https://www.packyapi.com/v1';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1024';
const QUALITY = process.env.QUALITY ?? 'low';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

function newestPng() {
  const f = readdirSync(OUT)
    .filter(n => n.startsWith('packyapi-miyuri-') && n.endsWith('.png'))
    .map(n => ({ n, m: statSync(join(OUT, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return f[0] ? join(OUT, f[0].n) : null;
}

const INPUT = process.argv[2] ?? newestPng();
if (!INPUT) { console.error('no input'); process.exit(1); }
console.log(`[input] ${INPUT}`);

const PROMPT = `Same woman, same ivory sheer organza babydoll, same hair, same pose, same expression. RELOCATE her to a luxury marble bathroom interior — large slab of veined Calacatta marble wall behind, polished marble floor reflecting warm light, freestanding sculptural soaking tub partially visible camera-left, single warm tungsten sconce camera-right at shoulder height, 2700K, soft amber light grazing the marble and the sheer organza. Keep cinematic shadow falloff, keep deep shadow ratio, keep f/1.8 shallow depth of field, keep 85mm framing head to knee. Photorealism, Vogue Japan editorial grade. No text, no watermarks.`;

const client = new OpenAI({ apiKey: KEY, baseURL: BASE });
const imageFile = await toFile(readFileSync(INPUT), 'input.png', { type: 'image/png' });

console.log(`[edit sdk] model=${MODEL} size=${SIZE} quality=${QUALITY}`);
const t0 = Date.now();
let resp;
try {
  resp = await client.images.edit({
    model: MODEL,
    image: imageFile,
    prompt: PROMPT,
    size: SIZE,
    quality: QUALITY,
    n: 1,
  });
} catch (e) {
  const elapsed = Date.now() - t0;
  console.log(`[fail] ${elapsed}ms ${e.status ?? ''} ${e.message}`);
  if (e.error) console.log(JSON.stringify(e.error, null, 2));
  process.exit(1);
}
const elapsed = Date.now() - t0;
console.log(`[edit sdk] OK ${elapsed}ms`);

const item = resp?.data?.[0];
const log = { stamp: STAMP, base: BASE, model: MODEL, input: INPUT, elapsed, keys: Object.keys(resp ?? {}), itemKeys: item ? Object.keys(item) : null, url: item?.url };
if (item?.b64_json) {
  const out = Buffer.from(item.b64_json, 'base64');
  const p = join(OUT, `packyapi-edit-bathroom-${STAMP}.png`);
  writeFileSync(p, out);
  console.log(`[saved b64] → ${p} (${out.length} bytes)`);
  log.saved = p;
} else if (item?.url) {
  console.log(`[url] ${item.url}`);
  const dl = await fetch(item.url);
  if (dl.ok) {
    const out = Buffer.from(await dl.arrayBuffer());
    const p = join(OUT, `packyapi-edit-bathroom-${STAMP}.png`);
    writeFileSync(p, out);
    console.log(`[saved url] → ${p} (${out.length} bytes)`);
    log.saved = p;
  }
}
writeFileSync(join(OUT, `packyapi-edit-sdk-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done]`);
