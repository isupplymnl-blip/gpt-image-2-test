/**
 * 3-ref compose: model + bikini product + earbuds case
 * Setting described in text — no 4th ref
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

// Reuse images from previous run
const modelBuf    = fs.readFileSync('test-output/step1-model-1778067590229.jpeg');
const bikiniBuf   = fs.readFileSync('test-output/step2-bikini-product-1778067633027.jpeg');
const productBuf  = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');

const pngs = await Promise.all([modelBuf, bikiniBuf, productBuf].map(b =>
  sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
));
console.log('3 refs at 512px:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

const COMPOSE = `Vogue Philippines beach editorial. iSupply Pro 2 campaign. Image 1 = female model. Image 2 = sand-ivory swimwear set — dress model in this. Image 3 = white earbud case, model holds it open toward camera. Beach setting: powder-blue sky, white sand, ocean horizon. Low upward angle, 4:5 vertical. TEXT: "iSupply Philippines" top small caps white. "PRO 2" massive bold white center. "749.99 Pesos" italic white below. "SHOP NOW" pill button bottom.`;

console.log(`prompt: ${COMPOSE.length} chars`);

const form = new FormData();
form.append('model', 'gpt-image-2');
form.append('prompt', COMPOSE);
form.append('size', 'auto');
form.append('quality', 'medium');
form.append('moderation', 'low');
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
console.log(`status: ${res.status} in ${e}s`);

if (!res.ok) {
  const body = await res.text();
  const isMod = body.includes('违反') || body.includes('政策');
  console.error(`FAILED${isMod ? ' (MODERATION)' : ''}: ${body.slice(0, 300)}`);
  process.exit(1);
}

const d = await res.json();
const item = d.data?.[0];
const buf = item?.url
  ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
  : Buffer.from(item.b64_json, 'base64');

const out = `test-output/final-3ref-compose-${Date.now()}.jpeg`;
fs.writeFileSync(out, buf);
console.log(`✓ saved: ${out} (${Math.round(buf.length / 1024)}KB)`);
