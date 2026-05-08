/**
 * Playbook-optimized compose test.
 * Uses Virtual Try-On pattern (Recipe 6) + multi-ref labeling rules.
 * Prompt kept tight per playbook: Scene→Subject→Details→Typography→Constraints
 * Reuses generated refs from previous test run.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

async function edit(bufs, prompt, quality = 'medium', size = 'auto') {
  const pngs = await Promise.all(bufs.map(b =>
    sharp(b).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  ));
  console.log('refs:', pngs.map(b => Math.round(b.length / 1024) + 'KB'), `prompt: ${prompt.length}c`);
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', quality);
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
  console.log(`→ ${res.status} in ${e}s`);
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  const item = d.data?.[0];
  const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
  const p = `test-output/playbook-result-${Date.now()}.jpeg`;
  fs.writeFileSync(p, buf);
  console.log(`saved: ${p} (${Math.round(buf.length / 1024)}KB)`);
  return buf;
}

// Load from disk — reuse previous generations
const modelBuf   = fs.readFileSync('test-output/step1-model-1778067590229.jpeg');
const bikiniBuf  = fs.readFileSync('test-output/step2-bikini-product-1778067633027.jpeg');
const productBuf = fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp');

// ── PROMPT: playbook Virtual Try-On pattern, 5-slot structure, tight ─────────
// Scene → Subject → Details → Typography → Constraints
const PROMPT = `Beach editorial, powder-blue sky, white sand, ocean horizon. ` +
`Image 1 = female model. Image 2 = sand-ivory swimwear — apply onto model from Image 1. Image 3 = white earbud case — held open in model's left hand toward camera. ` +
`Low upward angle, 4:5 vertical, heroic perspective. ` +
`"iSupply Philippines" top center white small-caps. "PRO 2" (P-R-O space 2) massive bold white center. "749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center. ` +
`No extra text, no duplicate letters. Keep model face, hair, pose. Match lighting from Image 1.`;

console.log(`\nPrompt: ${PROMPT.length} chars`);
await edit([modelBuf, bikiniBuf, productBuf], PROMPT);
