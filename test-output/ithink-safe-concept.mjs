/**
 * Clean test: different concept, safe content
 * Model: fully clothed, business casual
 * Setting: modern cafe / studio interior
 * Product: headphones (not earbuds case)
 * Goal: confirm 3-ref edits channel works when refs are unambiguously safe
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

async function gen(prompt, extraParams = {}) {
  const body = JSON.stringify({ model: 'gpt-image-2', prompt, size: 'auto', quality: 'medium', output_format: 'jpeg', ...extraParams });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 90_000);
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body, signal: ac.signal,
  });
  const e = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  gen → ${res.status} in ${e}s`);
  if (!res.ok) throw new Error((await res.text()).slice(0, 200));
  const d = await res.json();
  const item = d.data?.[0];
  if (item?.url) { const r = await fetch(item.url); return Buffer.from(await r.arrayBuffer()); }
  return Buffer.from(item.b64_json, 'base64');
}

async function edit(bufs, prompt) {
  const pngs = await Promise.all(bufs.map(b => sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()));
  console.log('  ref sizes:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', 'auto');
  form.append('quality', 'medium');
  form.append('background', 'opaque');
  form.append('output_format', 'jpeg');
  for (let i = 0; i < pngs.length; i++) form.append('image', new Blob([pngs[i]], { type: 'image/png' }), `ref-${i}.png`);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/v1/images/edits`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form, signal: ac.signal,
  });
  const e = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  edit → ${res.status} in ${e}s`);
  if (!res.ok) throw new Error((await res.text()).slice(0, 300));
  const d = await res.json();
  const item = d.data?.[0];
  if (item?.url) { const r = await fetch(item.url); return Buffer.from(await r.arrayBuffer()); }
  return Buffer.from(item.b64_json, 'base64');
}

function save(buf, name) {
  const p = `test-output/${name}-${Date.now()}.jpeg`;
  fs.writeFileSync(p, buf);
  console.log(`  saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
  return buf;
}

// Completely different, unambiguous content
console.log('\n[1/3] Model — business casual, fully clothed');
const modelBuf = save(await gen(
  'Professional lifestyle photography. Filipino male model, 32 years old, wearing a clean white button-up shirt, dark slim trousers. Sitting relaxed at a modern wooden desk, natural window light from left. Neutral background, soft bokeh. No text. Editorial portrait style.'
), 'safe-step1-model');

console.log('\n[2/3] Setting — modern cafe interior');
const settingBuf = save(await gen(
  'Modern minimal cafe interior. Clean background plate, no people, no products. Warm wood tones, concrete accents, large window with soft natural daylight. Potted plants, blurred background bokeh. Warm 3200K ambient light. No text.'
), 'safe-step2-setting');

console.log('\n[3/3] Compose with product ref (original P1054788)');
const productBuf = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');

const COMPOSE = 'iSupply Pro 2 product campaign. Three reference images: Image 1 = the model (male, business casual), Image 2 = the modern cafe setting, Image 3 = the product (white wireless earbuds case). Place the model in the cafe setting, holding the open earbud case in his right hand at chest level, case facing camera. Clean editorial composition, 4:5 vertical. TEXT: "iSupply Philippines" top center white small caps. "PRO 2" large bold white center. "749.99 Pesos" white italic below. "SHOP NOW" pill button bottom. No extra text.';
console.log(`  compose prompt: ${COMPOSE.length} chars`);

const finalBuf = save(await edit([modelBuf, settingBuf, productBuf], COMPOSE), 'safe-step3-final');
console.log('\n✓ Done — check test-output/ for results');
