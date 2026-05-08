/**
 * Diagnostic: same safe refs (male model + cafe) but with TEXT OVERLAY prompt
 * If this passes → text prompt is fine, the female model / bikini refs are the issue
 * If this fails → iThink edits channel is just degraded today
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

const modelBuf   = fs.readFileSync('test-output/safe-step1-model-1778067025902.jpeg');
const settingBuf = fs.readFileSync('test-output/safe-step2-setting-1778067100673.jpeg');
const productBuf = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');

const pngs = await Promise.all([modelBuf, settingBuf, productBuf].map(b =>
  sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
));
console.log('refs:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

// Same TEXT prompt structure as the failing test
const PROMPT = `Modern cafe editorial. iSupply Pro 2 campaign. Image 1 = the model. Image 2 = the cafe setting. Image 3 = white earbud case — held open in model's right hand toward camera. 4:5 vertical. "iSupply Philippines" top center white small-caps. "PRO 2" massive bold white center. "749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center. No extra text.`;

console.log(`prompt: ${PROMPT.length} chars`);

const form = new FormData();
form.append('model', 'gpt-image-2');
form.append('prompt', PROMPT);
form.append('size', 'auto');
form.append('quality', 'medium');
form.append('background', 'opaque');
form.append('output_format', 'jpeg');
form.append('moderation', 'low');
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
  console.error(`FAILED${isMod ? ' (MODERATION)' : ' (OTHER)'}: ${body.slice(0, 300)}`);
  process.exit(1);
}
const d = await res.json();
const item = d.data?.[0];
const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
const p = `test-output/diag-safe-refs-text-${Date.now()}.jpeg`;
fs.writeFileSync(p, buf);
console.log(`✓ saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
