import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

const modelBuf = fs.readFileSync('test-output/step1-model-1778066517372.jpeg');
const settingBuf = fs.readFileSync('test-output/step2-setting-1778066555553.jpeg');
const productBuf = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');

const t0r = Date.now();
const pngs = await Promise.all([modelBuf, settingBuf, productBuf].map(buf =>
  sharp(buf).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
));
console.log('refs at 256px:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));
console.log('total:', Math.round(pngs.reduce((s, b) => s + b.length, 0) / 1024) + 'KB in', (Date.now() - t0r) + 'ms');

const COMPOSE_PROMPT = 'Vogue Philippines beach editorial. iSupply Pro 2 campaign. Compose using three reference images: Image 1 = the model, Image 2 = the beach setting, Image 3 = the product (matte white charging case with earbuds). Place the model in the beach setting. Model holds the open case in left hand extended toward camera — case in sharp focus as dominant foreground hero element. Maintain exact model appearance and setting lighting. TEXT OVERLAY: top center small white sans-serif caps "iSupply Philippines". Small white above headline "Active Noise Cancellation". Massive bold lowercase white center "PRO 2". White serif italic right-aligned below "749.99 Pesos". Black text on white pill button bottom center "SHOP NOW". 4:5 vertical.';

console.log('prompt:', COMPOSE_PROMPT.length, 'chars');

const form = new FormData();
form.append('model', 'gpt-image-2');
form.append('prompt', COMPOSE_PROMPT);
form.append('size', 'auto');
form.append('quality', 'medium');
form.append('background', 'opaque');
form.append('output_format', 'jpeg');
for (let i = 0; i < pngs.length; i++) form.append('image', new Blob([pngs[i]], { type: 'image/png' }), `ref-${i}.png`);

const ac = new AbortController();
const timeout = setTimeout(() => ac.abort(), 120_000);
const t0 = Date.now();
const res = await fetch(`${BASE_URL}/v1/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form, signal: ac.signal });
clearTimeout(timeout);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`status: ${res.status} in ${elapsed}s`);

if (!res.ok) { console.error('FAILED:', (await res.text()).slice(0, 400)); process.exit(1); }
const data = await res.json();
const item = data.data?.[0];
let buf;
if (item?.url) { const r = await fetch(item.url); buf = Buffer.from(await r.arrayBuffer()); }
else buf = Buffer.from(item.b64_json, 'base64');

const out = `test-output/step4-compose-${Date.now()}.jpeg`;
fs.writeFileSync(out, buf);
console.log(`✓ saved: ${out} (${Math.round(buf.length / 1024)}KB)`);
