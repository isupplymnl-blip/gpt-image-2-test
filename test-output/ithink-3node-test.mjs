/**
 * Architecture test: model ref + setting ref + product ref → short compose prompt
 * Mimics what ModelCreationNode + SettingNode + UploadNode would do.
 *
 * Step 1: Generate model composite (text-to-image, no refs)
 * Step 2: Generate setting plate (text-to-image, no refs)
 * Step 3: Compose final image using model + setting + product as 3 refs, SHORT prompt
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

async function generate(prompt, extraParams = {}) {
  const body = JSON.stringify({ model: 'gpt-image-2', prompt, size: 'auto', quality: 'medium', output_format: 'jpeg', ...extraParams });
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 90_000);
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body,
    signal: ac.signal,
  });
  clearTimeout(timeout);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  generations → ${res.status} in ${elapsed}s`);
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0, 200)}`); }
  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error('no data item');
  if (item.url) {
    const imgRes = await fetch(item.url);
    return Buffer.from(await imgRes.arrayBuffer());
  }
  return Buffer.from(item.b64_json, 'base64');
}

async function edits(buffers, prompt) {
  const results = await Promise.allSettled(
    buffers.map(buf => sharp(buf).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer())
  );
  const pngBufs = results.filter(r => r.status === 'fulfilled').map(r => r.value);

  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', 'auto');
  form.append('quality', 'medium');
  form.append('background', 'opaque');
  form.append('output_format', 'jpeg');
  for (let i = 0; i < pngBufs.length; i++) {
    form.append('image', new Blob([pngBufs[i]], { type: 'image/png' }), `ref-${i}.png`);
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
    signal: ac.signal,
  });
  clearTimeout(timeout);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  edits → ${res.status} in ${elapsed}s`);
  if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0, 300)}`); }
  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error('no data item');
  if (item.url) {
    const imgRes = await fetch(item.url);
    return Buffer.from(await imgRes.arrayBuffer());
  }
  return Buffer.from(item.b64_json, 'base64');
}

function save(buf, name) {
  const p = path.join(__dirname, `${name}-${Date.now()}.jpeg`);
  fs.writeFileSync(p, buf);
  console.log(`  saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
  return p;
}

// ── STEP 1: Model ────────────────────────────────────────────────────────────
console.log('\n[1/3] Generating model composite...');
const MODEL_PROMPT = `Vogue Philippines fashion editorial. Commercial photography for iSupply Philippines 2026. Shot on Sony A7III, 28mm f/2.8, ISO 200, natural tropical daylight from camera-right at 20 degrees, 5500K. Southeast Asian female model, 28 years old, Fitzpatrick IV warm caramel skin, golden-honey undertone, natural skin texture, cinematic shadow falloff. Dark brown-black straight hair mid-back length. Dark brown almond eyes, serious direct editorial gaze. Wearing two-piece resort swimwear ensemble: triangle-cup swim top in warm sand-ivory matte fabric with neck-tie straps, matching high-cut brief with narrow side ties at hip. Left arm extended dynamically forward toward camera. Low upward camera angle, heroic perspective. Full-body 4:5 vertical. Powder-blue sky background. No text.`;

const modelBuf = await generate(MODEL_PROMPT);
save(modelBuf, 'step1-model');

// ── STEP 2: Setting ──────────────────────────────────────────────────────────
console.log('\n[2/3] Generating setting plate...');
const SETTING_PROMPT = `Vogue Philippines beach editorial background plate. Commercial campaign photography. Sony A7III 28mm, ISO 200, natural tropical daylight from camera-right, 5500K. No people, no products — background plate only. Wide open powder-blue sky (hex 7BA8D4) dominant upper two-thirds with wispy clouds at upper corners. Ocean horizon soft and blurred at lower third. Fine white sand texture in extreme foreground slightly out of focus at f/2.8. Subtle warm tropical haze at horizon. Low upward ground-level camera angle. 4:5 vertical ratio.`;

const settingBuf = await generate(SETTING_PROMPT);
save(settingBuf, 'step2-setting');

// ── STEP 3: Product ref ──────────────────────────────────────────────────────
console.log('\n[3/3] Loading product ref...');
const productBuf = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');
save(productBuf, 'step3-product-original');

// ── STEP 4: Compose ──────────────────────────────────────────────────────────
console.log('\n[4/4] Compositing (short prompt + 3 refs)...');
// Short compose prompt — refs carry the visual load, text just directs composition
const COMPOSE_PROMPT = `Vogue Philippines beach editorial. iSupply Pro 2 campaign. Compose using the three reference images: Image 1 = the model, Image 2 = the beach setting, Image 3 = the product (matte white charging case with earbuds). Place the model in the beach setting. Model holds the open case in left hand extended toward camera — case in sharp focus as dominant foreground hero element. Maintain model's exact appearance and the setting's exact lighting and sky. TEXT OVERLAY: "iSupply Philippines" top center small white sans-serif caps. "Active Noise Cancellation" small white above headline. "PRO 2" massive bold lowercase white center. "749.99 Pesos" white serif italic right-aligned below headline. "SHOP NOW →" black text on white pill button bottom center. 4:5 vertical.`;

console.log(`  compose prompt length: ${COMPOSE_PROMPT.length} chars`);

const finalBuf = await edits([modelBuf, settingBuf, productBuf], COMPOSE_PROMPT);
save(finalBuf, 'step4-final-compose');

console.log('\n✓ Done — check test-output/ for all 4 images');
