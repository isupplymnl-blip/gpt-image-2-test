#!/usr/bin/env node
/**
 * Test 25: uocode.com — Vogue Japan ivory chiffon slip (user-confirmed working on website).
 * /v1/images/generations, JSON, OpenAI-compatible. Bumped undici timeouts.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
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

const PROMPT = `Vogue Japan luxury editorial. Commercial nightwear campaign photography for Miyuri brand. Dimly lit bedroom interior, near-black left wall, warm textured plaster wall right catching lamp glow, single warm tungsten bedside lamp camera-right at hip height, 2700K, lamp light raking across silk chiffon creating warm translucent quality, extreme shadow ratio, lamp bokeh orb right background, no flash. Medium shot head to knee, 85mm equivalent, f/1.8. Japanese woman, 21 years old, fair skin with warm peachy undertone, Fitzpatrick II, natural micro-texture visible at cheeks and bare shoulders, warm amber specular on collarbone and cheekbones, cinematic shadow falloff — authentic skin, not filtered. Long wavy dark brown hair loosely falling past shoulders, face-framing strands forward. Single eyelid, deep brown eyes, serene heavy-lidded gaze. Heart-shaped face, soft defined jaw, full lips. Wearing an ivory silk chiffon slip dress — deep plunge V-neckline falling to sternum, ultra-thin spaghetti straps, bias-cut body draping softly against figure, fabric semi-opaque with warm lamp light passing through, mid-thigh hem. Body angled 20° from camera, weight on left hip, leaning softly against dark wall, both arms loosely at sides, serene gaze downward with lips slightly parted. Ivory chiffon catching warm amber, semi-opaque fabric glowing, deep blacks, intimate cinematic grade. Shot on Sony A7III, 85mm f/1.8, ISO 1600. Photorealism. No text, no watermarks.`;

console.log(`[gen] ${BASE}/v1/images/generations  model=${MODEL} size=${SIZE} quality=${QUALITY}`);
const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/generations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: MODEL, prompt: PROMPT, size: SIZE, quality: QUALITY, n: 1, moderation: 'low' }),
});
const txt = await res.text();
const elapsed = Date.now() - t0;
const ct = res.headers.get('content-type') ?? '';
console.log(`[gen] HTTP ${res.status} ${ct} ${elapsed}ms bytes=${txt.length}`);

let parsed = null; try { parsed = JSON.parse(txt); } catch {}
const log = { stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY, http: res.status, ct, elapsed, bytes: txt.length, bodyHead: txt.slice(0, 800) };

if (!res.ok) {
  console.log(`[fail] ${txt.slice(0, 800)}`);
  writeFileSync(join(OUT, `uocode-japan-${STAMP}.json`), JSON.stringify(log, null, 2));
  process.exit(1);
}

const item = parsed?.data?.[0];
if (item?.b64_json) {
  const buf = Buffer.from(item.b64_json, 'base64');
  const file = join(OUT, `uocode-japan-${STAMP}.png`);
  writeFileSync(file, buf);
  console.log(`[saved b64] → ${file} (${buf.length} bytes)`);
  log.saved = file;
} else if (item?.url) {
  console.log(`[url] ${item.url}`);
  if (item.revised_prompt) console.log(`[revised] ${item.revised_prompt.slice(0, 200)}`);
  const dl = await fetch(item.url);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `uocode-japan-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`[saved url] → ${file} (${buf.length} bytes)`);
    log.saved = file; log.url = item.url; log.revised_prompt = item.revised_prompt;
  }
}

writeFileSync(join(OUT, `uocode-japan-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/uocode-japan-${STAMP}.json`);
