/**
 * Token tier test — same failing refs (female model + swimwear flat-lay) on different token tiers
 * 0.8x: sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7 (current)
 * 1.5x: sk-EwqdT7u1zTfP0Q77vrW2OJFrw9j5YcGJP1FSEGnHv45vfYz2
 * 2.0x: sk-j9Y7K3SxkAEufjINKYr5maM6u3o97CkTUOAp99AWUpj38HnF
 */
import fs from 'node:fs';
import sharp from 'sharp';

const BASE_URL = 'https://token.ithinkai.cn';

const TOKENS = [
  { label: '1.5x', key: 'sk-EwqdT7u1zTfP0Q77vrW2OJFrw9j5YcGJP1FSEGnHv45vfYz2' },
  { label: '2.0x', key: 'sk-j9Y7K3SxkAEufjINKYr5maM6u3o97CkTUOAp99AWUpj38HnF' },
];

// Load the refs that have been failing (female model + bikini flat-lay)
const refs = [
  fs.readFileSync('test-output/step1-model-1778067590229.jpeg'),   // female model, neutral
  fs.readFileSync('test-output/step2-bikini-product-1778067633027.jpeg'), // swimwear flat-lay
  fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp'),
];

const pngs = await Promise.all(refs.map(b =>
  sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
));
console.log('refs:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

const PROMPT = `Beach editorial, powder-blue sky, white sand, ocean horizon. Image 1 = female model. Image 2 = sand-ivory swimwear — apply onto model from Image 1. Image 3 = white earbud case — held open in model's left hand toward camera. Low upward angle, 4:5 vertical. "iSupply Philippines" top center white small-caps. "PRO 2" massive bold white center. "749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center. No extra text.`;
console.log(`prompt: ${PROMPT.length} chars\n`);

for (const { label, key } of TOKENS) {
  console.log(`\n── ${label} token ──`);
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
  try {
    const res = await fetch(`${BASE_URL}/v1/images/edits`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: ac.signal,
    });
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`status: ${res.status} in ${e}s`);
    if (res.ok) {
      const d = await res.json();
      const item = d.data?.[0];
      const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
      const p = `test-output/tier-${label}-${Date.now()}.jpeg`;
      fs.writeFileSync(p, buf);
      console.log(`✓ PASS saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
    } else {
      const body = await res.text();
      const isMod = body.includes('违反') || body.includes('政策');
      console.log(`✗ FAIL${isMod ? ' (MODERATION)' : ''}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✗ ${err.name === 'AbortError' ? 'ABORTED at 120s' : err.message} in ${e}s`);
  }
}
