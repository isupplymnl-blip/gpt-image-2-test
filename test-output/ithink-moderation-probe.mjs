/**
 * Moderation probe — isolates what's triggering PRC 500 (masked as 554):
 *   Test A: 3 refs + neutral prompt (is it the IMAGES?)
 *   Test B: 3 refs + safe prompt + moderation:low param
 *   Test C: 3 refs + safe prompt (no extra params)
 *
 * Run all in sequence, compare which passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';
const OUT_DIR = __dirname;

const REFS = [
  'C:/Users/miuri/Downloads/image-1778065103328.png',
  'C:/Users/miuri/Downloads/image-1778065089753.png',
  'C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp',
];

async function loadRef(p) {
  const buf = fs.readFileSync(p);
  return sharp(buf).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

async function runTest(label, prompt, extraParams = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST ${label}`);
  console.log('='.repeat(60));

  const t0Refs = Date.now();
  const results = await Promise.allSettled(REFS.map(loadRef));
  const buffers = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  console.log(`refs loaded: ${buffers.length}/${REFS.length} in ${Date.now() - t0Refs}ms`);

  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', 'auto');
  form.append('quality', 'medium');
  form.append('background', 'opaque');
  form.append('output_format', 'jpeg');
  for (const [k, v] of Object.entries(extraParams)) form.append(k, String(v));
  for (let i = 0; i < buffers.length; i++) {
    form.append('image', new Blob([buffers[i]], { type: 'image/png' }), `ref-${i}.png`);
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();

  try {
    const res = await fetch(`${BASE_URL}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: form,
      signal: ac.signal,
    });
    clearTimeout(timeout);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const body = await res.text();

    console.log(`status: ${res.status} in ${elapsed}s`);
    console.log(`body preview: ${body.slice(0, 400)}`);

    if (res.status === 200) {
      const data = JSON.parse(body);
      const item = data?.data?.[0];
      let buffer;
      if (item?.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
      else if (item?.url) {
        const imgRes = await fetch(item.url);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      }
      if (buffer) {
        const outFile = path.join(OUT_DIR, `probe-${label.replace(/\s+/g, '-')}-${Date.now()}.jpeg`);
        fs.writeFileSync(outFile, buffer);
        console.log(`✓ SAVED: ${outFile}`);
      }
      return 'PASS';
    } else {
      const isMod = body.includes('违反') || body.includes('政策') || body.includes('platform policy') || body.includes('content');
      console.log(isMod ? '>>> MODERATION FLAG <<<' : '>>> OTHER ERROR <<<');
      return `FAIL_${res.status}`;
    }
  } catch (err) {
    clearTimeout(timeout);
    console.log(`error: ${err.name === 'AbortError' ? 'ABORTED at 120s' : err.message}`);
    return 'FAIL_ABORT';
  }
}

// ── TEST A: neutral prompt, 3 refs — does image content itself flag? ──
const NEUTRAL_PROMPT = `Commercial product photography for wireless earbuds. Three reference images provided — use for style and context. Professional studio photography, clean composition, high quality.`;

// ── TEST B: safe editorial prompt (from passing 1-ref test) ──
const SAFE_PROMPT = `Vogue Philippines beach editorial. Commercial campaign photography for iSupply Pro 2 wireless earbuds, iSupply Philippines 2026. Shot on Sony A7III, 28mm f/2.8, ISO 200, natural tropical daylight from camera-right at 20 degrees above horizon, 5500K, no flash. 4:5 ratio vertical format.

Southeast Asian female model, approximately 28 years old, Fitzpatrick IV warm caramel skin with golden-honey undertone, natural skin texture with subtle micro-contrast, cinematic shadow falloff on cheeks. Dark brown-black straight hair mid-back length, windswept at ends by ocean breeze, golden rim light catching hair edges. Dark brown almond eyes, serious direct editorial gaze at camera, composed and bold. Wearing a two-piece triangle-cup resort top in warm sand-ivory matte fabric with thin neck-tie straps, with matching high-cut brief separates in the same fabric — fashion-forward resort beachwear ensemble, elegant and editorial.

Left arm extended forward dynamically toward camera, hand holding a matte white rounded rectangular charging case — lid open at 120 degrees, two white true wireless earbuds with soft silicone ear tips seated inside dual circular cavities, short stems pointing downward. Case occupies lower-center foreground, sharp focus, dominant product hero element.

Wide open powder-blue sky (hex 7BA8D4) upper two-thirds, ocean horizon lower third, fine white sand foreground. TEXT: large bold lowercase "PRO 2" center frame, "iSupply Philippines" top center small caps, "Active Noise Cancellation" above headline, "749.99 Pesos" serif italic below headline, "SHOP NOW" pill button bottom center.`;

const results = {};

results['A-neutral-3refs'] = await runTest('A neutral-3refs', NEUTRAL_PROMPT);
results['B-safe-3refs'] = await runTest('B safe-prompt-3refs', SAFE_PROMPT);
results['C-safe-3refs-mod-low'] = await runTest('C safe-prompt-3refs-moderation-low', SAFE_PROMPT, { moderation: 'low' });

console.log('\n\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v}`);
