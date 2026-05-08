#!/usr/bin/env node
/**
 * Test 28: uocode /v1/images/edits — official multipart path per uocode docs.
 * Single ref image via `image=@file`. Uses OpenAI SDK (handles multipart correctly).
 *
 * Goal: better identity preservation than test 27 (which used images[] field on
 * /v1/images/generations and produced a different woman).
 *
 * Usage: node tools/scrape-tests/28-uocode-edits.mjs [<png-path>]
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';
import { join } from 'node:path';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

const KEY = process.env.UOCODE_KEY ?? 'sk-NpwmON4KNrmRWJGU7K42SQEQ3IIVBr6srvCAxV8v7q6HRzi6';
const BASE = process.env.UOCODE_BASE ?? 'https://www.uocode.com/v1';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1024';
const QUALITY = process.env.QUALITY ?? 'low';

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

const INPUT = process.argv[2] ?? newestPng('uocode-japan-') ?? newestPng('uocode-vietnam-');
if (!INPUT) { console.error('no png found'); process.exit(1); }
console.log(`[input] ${INPUT}`);

const PROMPT = `Same woman, same ivory silk chiffon slip dress, same hair, same pose, same expression. RELOCATE her to a luxury marble bathroom interior — large slab of veined Calacatta marble wall behind, polished marble floor reflecting warm light, freestanding sculptural soaking tub partially visible camera-left, single warm tungsten sconce camera-right at shoulder height, 2700K, soft amber light grazing the marble and the chiffon. Keep cinematic shadow falloff, deep shadow ratio, f/1.8 shallow depth of field, 85mm framing head to knee. Photorealism, Vogue Japan editorial grade. No text, no watermarks.`;

const client = new OpenAI({ apiKey: KEY, baseURL: BASE });
const imageFile = await toFile(readFileSync(INPUT), 'input.png', { type: 'image/png' });

console.log(`[edits sdk] POST ${BASE}/images/edits  model=${MODEL} size=${SIZE} quality=${QUALITY}`);
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
  console.log(`[fail] ${elapsed}ms status=${e.status ?? '?'} ${e.message}`);
  if (e.error) console.log(JSON.stringify(e.error, null, 2));
  writeFileSync(join(OUT, `uocode-edits-${STAMP}.json`), JSON.stringify({ stamp: STAMP, error: e.message, status: e.status, body: e.error, elapsed }, null, 2));
  process.exit(1);
}
const elapsed = Date.now() - t0;
console.log(`[edits] OK ${elapsed}ms`);

const item = resp?.data?.[0];
const log = { stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY, input: INPUT, elapsed, itemKeys: item ? Object.keys(item) : null };
if (item?.b64_json) {
  const buf = Buffer.from(item.b64_json, 'base64');
  const file = join(OUT, `uocode-edits-bathroom-${STAMP}.png`);
  writeFileSync(file, buf);
  console.log(`[saved b64] → ${file} (${buf.length} bytes)`);
  log.saved = file;
} else if (item?.url) {
  console.log(`[url] ${item.url}`);
  if (item.revised_prompt) console.log(`[revised] ${item.revised_prompt.slice(0, 200)}`);
  const dl = await fetch(item.url);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `uocode-edits-bathroom-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`[saved url] → ${file} (${buf.length} bytes)`);
    log.saved = file; log.url = item.url; log.revised_prompt = item.revised_prompt;
  }
}

writeFileSync(join(OUT, `uocode-edits-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/uocode-edits-${STAMP}.json`);
