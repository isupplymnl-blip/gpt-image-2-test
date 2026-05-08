/**
 * Confirms the parallel ref-loading fix works end-to-end.
 * Uses the same 5 refs + prompt from ITHINK_554_DIAGNOSTIC.md.
 * Saves generated image to test-output/result-<timestamp>.jpeg
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';

const refs = [
  'public/uploads/assets/asset-1777970428997-m2sj6e0.png',
  'public/uploads/assets/asset-1777971629364-n1z3rhy.png',
  'public/uploads/assets/asset-1777985345736-pysql0r.png',
  'public/generated/1777988983573-xyguyq0r9wg.png',
  'public/generated/1777986339406-m7bvebpocl.png',
].map(p => path.join(PROJECT_ROOT, p));

async function loadRef(p) {
  const buf = fs.readFileSync(p);
  return sharp(buf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

const prompt = `Create a high-end fashion editorial image featuring the model wearing the product. The composition should evoke luxury and sophistication, with cinematic lighting and a moody atmosphere. The model should be positioned in a three-quarter angle, looking slightly away from camera with a confident, contemplative expression. The background should be a softly blurred upscale interior with warm tones — perhaps a marble countertop, brass fixtures, and soft golden hour light filtering through sheer curtains. The product must be clearly visible and accurately rendered, maintaining all design details, colors, materials, and proportions exactly as shown in the reference images. Pay particular attention to fabric textures, stitching details, and any branding elements. The lighting setup should include a soft key light from camera-left at 45 degrees, a subtle fill light from the right, and a warm rim light to separate the subject from the background. Color grading should lean towards warm amber tones with slightly desaturated shadows, evoking a vintage film aesthetic. The image should have shallow depth of field with the model in sharp focus and the background pleasantly blurred. Composition follows the rule of thirds with the model's eyes aligned on the upper third line. Make sure the styling, makeup, and hair feel natural and editorial, not overly produced. The overall mood should be aspirational, intimate, and timeless. ${ ' Additional product accuracy notes: maintain exact silhouette, preserve all logo placements, retain accurate color matching to the brightness and saturation shown in references, and ensure any text or branding elements remain legible and accurate. Final output should be print-quality and suitable for high-end advertising campaigns or magazine spreads.'.repeat(4)}`;

console.log(`prompt length: ${prompt.length} chars`);
console.log(`refs: ${refs.length}`);

// PARALLEL load — the fix being tested
const t0Refs = Date.now();
console.log('\n[1/3] Loading refs in parallel...');
const refResults = await Promise.allSettled(refs.map(loadRef));
const refBuffers = [];
for (let i = 0; i < refResults.length; i++) {
  const r = refResults[i];
  if (r.status === 'fulfilled') {
    refBuffers.push(r.value);
    console.log(`  ref ${i}: OK (${Math.round(r.value.length / 1024)}KB)`);
  } else {
    console.warn(`  ref ${i}: FAILED —`, r.reason.message);
  }
}
console.log(`  → ${refBuffers.length}/${refs.length} loaded in ${Date.now() - t0Refs}ms`);

// Build multipart
const form = new FormData();
form.append('model', 'gpt-image-2');
form.append('prompt', prompt);
form.append('size', 'auto');
form.append('quality', 'high');
form.append('background', 'opaque');
form.append('output_format', 'jpeg');
for (let i = 0; i < refBuffers.length; i++) {
  form.append('image', new Blob([refBuffers[i]], { type: 'image/png' }), `ref-${i}.png`);
}

// Fire
const t0Api = Date.now();
console.log(`\n[2/3] POST ${BASE_URL}/v1/images/edits`);
const res = await fetch(`${BASE_URL}/v1/images/edits`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}` },
  body: form,
});
const elapsed = ((Date.now() - t0Api) / 1000).toFixed(1);
console.log(`  status: ${res.status} in ${elapsed}s`);

const interestingHeaders = ['content-type', 'x-oneapi-request-id', 'x-new-api-version', 'cf-ray'];
for (const h of interestingHeaders) {
  const v = res.headers.get(h);
  if (v) console.log(`  ${h}: ${v}`);
}

if (!res.ok) {
  const body = await res.text();
  console.error(`\nFAILED: ${res.status}`);
  console.error('body:', body.slice(0, 500));
  process.exit(1);
}

const data = await res.json();
const item = data?.data?.[0];
if (!item) {
  console.error('\nFAILED: response has no data items');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

// Save result
console.log('\n[3/3] Saving image...');
let buffer;
if (item.b64_json) {
  buffer = Buffer.from(item.b64_json, 'base64');
  console.log(`  source: b64_json (${Math.round(buffer.length / 1024)}KB)`);
} else if (item.url) {
  console.log(`  source: url → ${item.url}`);
  const imgRes = await fetch(item.url);
  buffer = Buffer.from(await imgRes.arrayBuffer());
  console.log(`  downloaded: ${Math.round(buffer.length / 1024)}KB`);
} else {
  console.error('\nFAILED: item has no b64_json or url');
  process.exit(1);
}

const outFile = path.join(__dirname, `result-${Date.now()}.jpeg`);
fs.writeFileSync(outFile, buffer);
console.log(`\n✓ PASS — saved to: ${outFile}`);
if (item.revised_prompt) console.log(`  revised_prompt: ${item.revised_prompt.slice(0, 120)}...`);
