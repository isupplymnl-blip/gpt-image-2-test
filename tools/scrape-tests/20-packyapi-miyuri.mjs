#!/usr/bin/env node
/**
 * Test 20: packyapi.com OpenAI-compatible image gen — Miyuri Vogue Japan prompt.
 * Direct POST /v1/images/generations, no probe.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
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

const PROMPT = `Vogue Japan luxury editorial. Commercial nightwear campaign photography for Miyuri brand. Wolford benchmark. Dimly lit bedroom interior, near-black left wall, warm textured plaster wall right, single warm tungsten bedside lamp camera-right at hip height, 2700K, lamp light passing through sheer organza creating luminous warm silhouette glow, extreme shadow ratio, lamp bokeh orb right background, no flash. Medium shot head to knee, 85mm equivalent, f/1.8. Japanese woman, 20 years old, porcelain skin with warm pink-ivory undertone, Fitzpatrick I, translucent quality at temples and shoulders, candlelight creates luminous warm halo across entire face, cinematic shadow falloff — not plastic, not airbrushed. Long wavy dark brown hair loosely pinned, face-framing strands falling forward. Double eyelid, deep brown iris, serene eyes half-closed. Heart-shaped face, soft jaw, full lips, arched brows. Wearing an ivory sheer organza babydoll — empire waist seam with small ivory satin ribbon bow at center front, delicate lace trim at empire seam, ultra-thin spaghetti straps, gathered sheer organza body, ruffled scalloped lace hem at mid-thigh, fabric glowing warmly where lamp light passes through. Contrapposto stance, weight on right hip, left leg slightly forward, both arms loosely at sides, eyes half-closed in serene expression, lips softly parted. Ivory organza glowing in warm lamp light, ruffled lace hem catching amber, deep blacks, ethereal cinematic intimacy. Shot on Sony A7III, 85mm f/1.8, ISO 1600. Photorealism. No text, no watermarks.`;

console.log(`[gen] ${BASE}/v1/images/generations  model=${MODEL} size=${SIZE} quality=${QUALITY}`);
const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/generations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    prompt: PROMPT,
    size: SIZE,
    quality: QUALITY,
    n: 1,
    moderation: 'low',
  }),
});
const txt = await res.text();
const elapsed = Date.now() - t0;
const ct = res.headers.get('content-type') ?? '';
console.log(`[gen] HTTP ${res.status} ${ct} ${elapsed}ms bytes=${txt.length}`);

let parsed = null;
try { parsed = JSON.parse(txt); } catch {}

const log = {
  stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY,
  http: res.status, ct, elapsed, bytes: txt.length,
  bodyHead: txt.slice(0, 800),
  parsedKeys: parsed ? Object.keys(parsed) : null,
};

if (!res.ok) {
  console.log(`[fail] ${txt.slice(0, 600)}`);
  writeFileSync(join(OUT, `packyapi-miyuri-${STAMP}.json`), JSON.stringify(log, null, 2));
  process.exit(1);
}

const item = parsed?.data?.[0];
if (item?.b64_json) {
  const buf = Buffer.from(item.b64_json, 'base64');
  const file = join(OUT, `packyapi-miyuri-${STAMP}.png`);
  writeFileSync(file, buf);
  console.log(`[saved b64] → ${file} (${buf.length} bytes)`);
  log.saved = file;
} else if (item?.url) {
  console.log(`[url] ${item.url}`);
  const dl = await fetch(item.url);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `packyapi-miyuri-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`[saved url] → ${file} (${buf.length} bytes)`);
    log.saved = file;
    log.url = item.url;
  } else {
    console.log(`[url fetch fail] HTTP ${dl.status}`);
  }
} else {
  console.log(`[no image] body:\n${txt.slice(0, 1200)}`);
}

writeFileSync(join(OUT, `packyapi-miyuri-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/packyapi-miyuri-${STAMP}.json`);
