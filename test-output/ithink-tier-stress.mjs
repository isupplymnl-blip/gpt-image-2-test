/**
 * Same stress test but cycling through all 3 token tiers
 * to see if higher multiplier routes to a different (unblocked) upstream channel
 */
import fs from 'node:fs';
import sharp from 'sharp';

const BASE_URL = 'https://token.ithinkai.cn';

const TOKENS = [
  { label: '0.8x', key: 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7' },
  { label: '1.5x', key: 'sk-EwqdT7u1zTfP0Q77vrW2OJFrw9j5YcGJP1FSEGnHv45vfYz2' },
  { label: '2.0x', key: 'sk-j9Y7K3SxkAEufjINKYr5maM6u3o97CkTUOAp99AWUpj38HnF' },
];

const refs = [
  fs.readFileSync('test-output/step1-model-1778067590229.jpeg'),
  fs.readFileSync('test-output/step2-bikini-product-1778067633027.jpeg'),
  fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp'),
];
const pngs = await Promise.all(refs.map(b =>
  sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
));
console.log('refs:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

const PROMPT = 'Beach editorial, powder-blue sky, white sand, ocean horizon. Image 1 = female model. Image 2 = sand-ivory swimwear — apply onto model from Image 1. Image 3 = white earbud case — held open in model\'s left hand toward camera. Low upward angle, 4:5 vertical. "iSupply Philippines" top center white small-caps. "PRO 2" massive bold white center. "749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center. No extra text.';

for (const { label, key } of TOKENS) {
  process.stdout.write(`${label}: `);
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', PROMPT);
  form.append('size', 'auto');
  form.append('quality', 'medium');
  form.append('background', 'opaque');
  form.append('output_format', 'jpeg');
  form.append('moderation', 'low');
  for (let j = 0; j < pngs.length; j++) form.append('image', new Blob([pngs[j]], { type: 'image/png' }), `ref-${j}.png`);

  const ac = new AbortController();
  setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/images/edits`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: ac.signal,
    });
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.ok) {
      const d = await res.json();
      const item = d.data?.[0];
      const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
      const p = `test-output/tier-stress-${label}-${Date.now()}.jpeg`;
      fs.writeFileSync(p, buf);
      console.log(`✅ ${res.status} in ${e}s → saved`);
    } else {
      console.log(`❌ ${res.status} in ${e}s`);
    }
  } catch (err) {
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`❌ ${err.name === 'AbortError' ? 'ABORT' : err.message} in ${e}s`);
  }
}
