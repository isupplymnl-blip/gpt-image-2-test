/**
 * Retry stress test — fire same request up to 6 times, see how many succeed.
 * This tests whether retry logic is sufficient or if the channel is just broken.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

const refs = [
  fs.readFileSync('test-output/step1-model-1778067590229.jpeg'),
  fs.readFileSync('test-output/step2-bikini-product-1778067633027.jpeg'),
  fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp'),
];
const pngs = await Promise.all(refs.map(b =>
  sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
));

const PROMPT = 'Beach editorial, powder-blue sky, white sand, ocean horizon. Image 1 = female model. Image 2 = sand-ivory swimwear — apply onto model from Image 1. Image 3 = white earbud case — held open in model\'s left hand toward camera. Low upward angle, 4:5 vertical. "iSupply Philippines" top center white small-caps. "PRO 2" massive bold white center. "749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center. No extra text.';

const MAX = 6;
const results = [];

for (let i = 1; i <= MAX; i++) {
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
  process.stdout.write(`attempt ${i}/${MAX}: `);

  try {
    const res = await fetch(`${BASE_URL}/v1/images/edits`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form, signal: ac.signal,
    });
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.ok) {
      const d = await res.json();
      const item = d.data?.[0];
      const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
      const p = `test-output/retry-attempt-${i}-${Date.now()}.jpeg`;
      fs.writeFileSync(p, buf);
      console.log(`✅ ${res.status} in ${e}s → ${p}`);
      results.push('PASS');
    } else {
      console.log(`❌ ${res.status} in ${e}s`);
      results.push(`FAIL_${res.status}`);
    }
  } catch (err) {
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`❌ ${err.name === 'AbortError' ? 'ABORT' : err.message} in ${e}s`);
    results.push('FAIL_ABORT');
  }
}

console.log(`\nResults: ${results.join(', ')}`);
console.log(`Pass rate: ${results.filter(r => r === 'PASS').length}/${MAX}`);
