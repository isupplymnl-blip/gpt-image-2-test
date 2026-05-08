/**
 * Concept 09 — "White Beach Has No Noise" — iSupply Pro 2 Boracay campaign
 * 5-slide carousel via gpt-image-2 on iThink (0.8x token)
 *
 * Step 1: Generate base model (text-only, no refs) → safe from content filter
 * Steps 2-6: Compose each slide using model ref + product ref
 *
 * Token: 0.8x sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';
const PRODUCT_PATH = 'C:/Users/miuri/Downloads/821b1999-dc9f-40d7-9d04-0ff019299c34.jpg';

// ── helpers ───────────────────────────────────────────────────────────────────
async function toPng(buf, maxPx = 512) {
  return sharp(buf)
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function generate(prompt, label) {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();
  process.stdout.write(`[${label}] generating... `);
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size: '1024x1280',
      quality: 'medium',
      output_format: 'jpeg',
      moderation: 'low',
      n: 1,
    }),
    signal: ac.signal,
  });
  const e = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    const txt = await res.text();
    console.log(`❌ ${res.status} in ${e}s — ${txt.slice(0, 200)}`);
    return null;
  }
  const d = await res.json();
  const item = d.data?.[0];
  const buf = item?.url
    ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
    : Buffer.from(item.b64_json, 'base64');
  const p = `test-output/c09-${label}-${Date.now()}.jpeg`;
  fs.writeFileSync(p, buf);
  console.log(`✅ ${e}s → ${p} (${Math.round(buf.length / 1024)}KB)`);
  return buf;
}

async function edit(refs, prompt, label) {
  const pngs = await Promise.all(refs.map(b => toPng(b)));
  console.log(`[${label}] refs: ${pngs.map(b => Math.round(b.length / 1024) + 'KB').join(', ')}, prompt: ${prompt.length}c`);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt);
    form.append('size', 'auto');
    form.append('quality', 'medium');
    form.append('background', 'opaque');
    form.append('output_format', 'jpeg');
    form.append('moderation', 'low');
    for (let i = 0; i < pngs.length; i++)
      form.append('image', new Blob([pngs[i]], { type: 'image/png' }), `ref-${i}.png`);

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 88_000);
    const t0 = Date.now();
    process.stdout.write(`[${label}] attempt ${attempt}/${MAX_ATTEMPTS}... `);

    try {
      const res = await fetch(`${BASE_URL}/v1/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}` },
        body: form,
        signal: ac.signal,
      });
      const e = ((Date.now() - t0) / 1000).toFixed(1);
      if (!res.ok) {
        const txt = await res.text();
        const code = res.status;
        console.log(`❌ ${code} in ${e}s — ${txt.slice(0, 150)}`);
        if (attempt < MAX_ATTEMPTS && (code === 524 || code === 503 || code === 554 || code === 500)) continue;
        return null;
      }
      const d = await res.json();
      const item = d.data?.[0];
      const buf = item?.url
        ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
        : Buffer.from(item.b64_json, 'base64');
      const p = `test-output/c09-${label}-${Date.now()}.jpeg`;
      fs.writeFileSync(p, buf);
      console.log(`✅ ${e}s → ${p} (${Math.round(buf.length / 1024)}KB)`);
      return buf;
    } catch (err) {
      const e = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`❌ ${err.name === 'AbortError' ? 'ABORT' : err.message} in ${e}s`);
      if (attempt < MAX_ATTEMPTS) continue;
      return null;
    }
  }
  return null;
}

// ── STEP 1: Generate base model (text-only, safe) ────────────────────────────
console.log('\n══ STEP 1: Base Model ══');
const MODEL_PROMPT =
  'Editorial portrait, iSupply Philippines 2026 campaign "Accessible Tranquility." ' +
  'Wide medium portrait of a Filipina model, approximately 22–25 years old. ' +
  'Fair warm mestiza skin — light golden-beige with natural sun-kissed glow across nose and shoulders. ' +
  'Soft oval face, high nose bridge, large expressive dark eyes fully open, calm confident gaze. ' +
  'Full lips, natural brow shape, small beauty mark near jaw. ' +
  'Long glossy dark brown hair in a loose low chignon with soft face-framing tendrils, a few strands lifted by beach breeze. ' +
  'Wearing a sheer floor-length warm cream linen kaftan loosely tied at waist, barefoot. ' +
  'Standing on Boracay White Beach at early morning — powdery white sand, Sibuyan Sea calm and glassy in seafoam green and teal behind her. ' +
  'Faces camera, weight on one hip, arms loose. ' +
  'Sheer kaftan catches soft early golden morning light, backlit and luminous. ' +
  'Upper 30% of frame: overexposed pale warm cream sky — clean negative space. ' +
  'Shallow depth of field f/1.8, White Beach shoreline dissolves into seafoam bokeh. ' +
  'Color grade: warm cream highlights, lifted shadows, subtle teal cast in shadows, Filipino skin tone warmth preserved. ' +
  '4:5 vertical ratio.';

const modelBuf = await generate(MODEL_PROMPT, 'step1-model');
if (!modelBuf) { console.log('Model generation failed. Exiting.'); process.exit(1); }

// Load product ref
const productBuf = fs.readFileSync(PRODUCT_PATH);

// ── SLIDE 1: Hook + Text Overlay ──────────────────────────────────────────────
console.log('\n══ SLIDE 1: Hook + Text Overlay ══');
const SLIDE1_PROMPT =
  'Same model as Image 1 — same face, hair, kaftan, beach setting. ' +
  'Keep exact model appearance and beach environment. ' +
  'Image 2 = iSupply Pro 2 earbud (glossy white, dark oval mesh grille, silver L/R engravings) — in both her ears. ' +
  'Clean negative space in upper 30% sky area. ' +
  'Text overlay in upper sky, Midnight Ocean color (#0D2B33), geometric sans-serif, wide letter-spacing, left-aligned, three lines: ' +
  '"boracay at 5am" first line, "belongs to no one." second line, "find it anyway." third line. ' +
  'Large display scale, airy unhurried weight — never bold. No drop shadow, no outline. ' +
  '4:5 vertical. Morning golden backlight, overexposed cream sky.';

const slide1 = await edit([modelBuf, productBuf], SLIDE1_PROMPT, 'slide1-hook');

// ── SLIDE 2: Walking Shoreline ────────────────────────────────────────────────
console.log('\n══ SLIDE 2: Walking Shoreline ══');
const SLIDE2_PROMPT =
  'Same Filipina model as Image 1 — sheer cream kaftan, loose chignon. ' +
  'Image 2 = iSupply Pro 2 earbud — visible in her near ear. ' +
  'Walking slowly along the very edge of Boracay White Beach shoreline — bare feet in wet white sand, shallow clear water washing around ankles. ' +
  'Iconic row of leaning coconut palms blurred in distant background. ' +
  'Shot from slightly behind and to the side — three-quarter rear angle, face in soft profile turning gently toward calm sea. ' +
  'Kaftan billows softly with breeze, catching early morning light. ' +
  'Upper 35% of frame: overexposed warm cream and pale gold sky. Wet white sand reflecting light at her feet. ' +
  'f/2.0. 4:5 vertical. No text. Mood: the beach is entirely hers.';

const slide2 = await edit([modelBuf, productBuf], SLIDE2_PROMPT, 'slide2-shoreline');

// ── SLIDE 3: Flat-lay (no model) ──────────────────────────────────────────────
console.log('\n══ SLIDE 3: Flat-lay ══');
const SLIDE3_PROMPT =
  'Overhead flat-lay editorial on fine white powdery sand of White Beach, Boracay. ' +
  'Image 1 = iSupply Pro 2 charging case (open, both earbuds nestled inside, green LED lit) — centered in lower third. ' +
  'Beside it: a pair of cream linen sandals, a smooth pale shell, a single small dried frangipani flower. ' +
  'Boracay white sand fills 55% of frame in pure luminous negative space — catching morning sun. ' +
  'Shot from directly above. Bright even morning coastal light — one clean soft shadow from the case. ' +
  '4:5 vertical. No text. No model. Mood: she is already in the water. This is what she left behind.';

const slide3 = await edit([productBuf], SLIDE3_PROMPT, 'slide3-flatlay');

// ── SLIDE 4: Close-up Portrait ────────────────────────────────────────────────
console.log('\n══ SLIDE 4: Close-up Portrait ══');
const SLIDE4_PROMPT =
  'Same Filipina model as Image 1 — close-up portrait, chest up. ' +
  'Boracay sea and distant palm-lined shore softly blurred behind her. ' +
  'Looking directly into camera, eyes open and warm, quiet private smile. ' +
  'Sheer kaftan draped loosely off one shoulder — natural and effortless. ' +
  'Image 2 = iSupply Pro 2 earbuds in both ears, stems catching golden morning light. ' +
  'Fair warm skin glowing softly in hazy coastal sun. ' +
  'Behind: Seafoam Green Sibuyan Sea and Warm Cream sky — 35% upper negative space, f/1.8 bokeh. ' +
  '4:5 vertical. No text. Mood: this is her Boracay. Not the crowded one.';

const slide4 = await edit([modelBuf, productBuf], SLIDE4_PROMPT, 'slide4-portrait');

// ── SLIDE 5: Seated Bamboo Lounger ───────────────────────────────────────────
console.log('\n══ SLIDE 5: Seated ══');
const SLIDE5_PROMPT =
  'Same Filipina model as Image 1 — seated on a natural bamboo beach lounger at edge of White Beach shoreline. ' +
  'Sibuyan Sea stretching wide behind her. One leg extended, other knee drawn up, kaftan pooled softly around her. ' +
  'Both hands wrapped around a small cream ceramic mug. Eyes open, gaze resting on calm sea — present, not performing. ' +
  'Image 2 = iSupply Pro 2 earbuds in both ears. ' +
  'Early golden-hour light warming skin and cream kaftan from the right. ' +
  'Behind: iconic Boracay horizon — teal sea meeting pale cream sky — 40% upper negative space, f/2.0 bokeh. ' +
  '4:5 vertical. No text. Mood: this is what she came for. Nothing more. Nothing less.';

const slide5 = await edit([modelBuf, productBuf], SLIDE5_PROMPT, 'slide5-seated');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══ DONE ══');
const results = { slide1, slide2, slide3, slide4, slide5 };
for (const [k, v] of Object.entries(results)) {
  console.log(`${k}: ${v ? '✅' : '❌'}`);
}
