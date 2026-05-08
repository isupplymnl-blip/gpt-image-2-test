/**
 * 4-ref compose test:
 *   Image 1 = model (neutral, no swimwear)
 *   Image 2 = bikini (product shot, treated as garment product)
 *   Image 3 = earbuds case (product)
 *   Image 4 = beach setting plate
 *
 * Compose prompt: dress model in bikini, hold case, place in setting.
 * This avoids describing swimwear on a body — bikini is just another product ref.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

async function gen(label, prompt) {
  console.log(`\n[GEN] ${label}`);
  console.log(`  prompt: ${prompt.length} chars`);
  const body = JSON.stringify({ model: 'gpt-image-2', prompt, size: 'auto', quality: 'medium', output_format: 'jpeg' });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 90_000);
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body, signal: ac.signal,
  });
  const e = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  → ${res.status} in ${e}s`);
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const item = d.data?.[0];
  const buf = item?.url
    ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
    : Buffer.from(item.b64_json, 'base64');
  const p = `test-output/${label.replace(/\s+/g, '-')}-${Date.now()}.jpeg`;
  fs.writeFileSync(p, buf);
  console.log(`  saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
  return buf;
}

async function compose(label, bufs, prompt) {
  console.log(`\n[EDIT] ${label}`);
  console.log(`  prompt: ${prompt.length} chars, ${bufs.length} refs`);
  const pngs = await Promise.all(bufs.map(b =>
    sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  ));
  console.log('  ref sizes:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', '1024x1280');
  form.append('quality', 'high');
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
  console.log(`  → ${res.status} in ${e}s`);
  if (!res.ok) {
    const body = await res.text();
    const isMod = body.includes('违反') || body.includes('政策');
    throw new Error(`${res.status}${isMod ? ' (MODERATION)' : ''}: ${body.slice(0, 300)}`);
  }
  const d = await res.json();
  const item = d.data?.[0];
  const buf = item?.url
    ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
    : Buffer.from(item.b64_json, 'base64');
  const p = `test-output/${label.replace(/\s+/g, '-')}-${Date.now()}.jpeg`;
  fs.writeFileSync(p, buf);
  console.log(`  saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
  return buf;
}

// ── STEP 1: Model — neutral, fully clothed, no swimwear ─────────────────────
const modelBuf = await gen('step1-model', `Editorial portrait photography. Southeast Asian female model, 28 years old, Fitzpatrick IV warm caramel skin, golden-honey undertone, natural skin texture. Dark brown-black straight hair mid-back length. Dark brown almond eyes, serious direct editorial gaze at camera. Wearing a plain white fitted crew-neck t-shirt and light-wash high-rise jeans — clean, neutral wardrobe. Standing upright, left arm relaxed at side. Pure white seamless studio background. Full-body shot, 4:5 vertical. No text. Shot on Sony A7III 85mm f/1.4, ISO 200, soft key light from left.`);

// ── STEP 2: Bikini — product shot, no person ────────────────────────────────
const bikiniBuf = await gen('step2-bikini-product', `Commercial product photography. Two-piece swimwear set laid flat on a clean white surface — triangle-cup swim top in warm sand-ivory matte fabric with thin neck-tie straps, matching high-cut brief with narrow side ties at hip. Fashion product flat-lay, top-down shot. Soft even studio lighting, no shadows. No person, no model — garment only. Clean white background. Sharp focus on fabric texture and construction details.`);

// ── STEP 3: Setting — beach plate, no people ────────────────────────────────
const settingBuf = await gen('step3-setting', `Vogue Philippines beach background plate. No people, no products — setting only. Wide open powder-blue sky (hex 7BA8D4) dominant upper two-thirds with wispy clouds at upper corners. Ocean horizon soft and blurred at lower third. Fine white sand texture in extreme foreground slightly out of focus at f/2.8. Subtle warm tropical haze at horizon. Low upward ground-level camera angle. Natural tropical daylight from right at 20 degrees, 5500K. 4:5 vertical.`);

// ── STEP 4: Product — earbuds case ──────────────────────────────────────────
const productBuf = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');
console.log(`\n[LOAD] step4-product: ${Math.round(productBuf.length / 1024)}KB (from disk)`);

// ── STEP 5: Compose ──────────────────────────────────────────────────────────
const COMPOSE = `Vogue Philippines beach editorial campaign for iSupply Pro 2 wireless earbuds. Four reference images provided:
Image 1 = the model (female, currently in white t-shirt and jeans — dress her in the swimwear from Image 2 for the final image)
Image 2 = the swimwear product (triangle-cup swim top and high-cut brief in sand-ivory) — apply this garment onto the model from Image 1
Image 3 = the beach setting plate — use as the background environment
Image 4 = the iSupply Pro 2 earbud charging case (matte white, lid open, earbuds visible inside)

Composition: model stands in the beach setting wearing the swimwear from Image 2. Her left arm extends forward dynamically toward camera, hand holding the open case from Image 4 — case in sharp focus, dominant foreground hero element. Low upward camera angle, heroic perspective. Model silhouette against powder-blue sky. 4:5 vertical.

TEXT OVERLAY — exact layout:
- Top center: small white sans-serif all-caps "iSupply Philippines"
- Above headline: small white sans-serif "Active Noise Cancellation"
- Center frame: massive bold lowercase white "PRO 2"
- Below headline right-aligned: white serif italic "749.99 Pesos"
- Bottom center: black sans-serif all-caps on white rounded pill button "SHOP NOW"`;

await compose('step5-final', [modelBuf, bikiniBuf, settingBuf, productBuf], COMPOSE);

console.log('\n✓ All done — check test-output/ for all 5 files');
