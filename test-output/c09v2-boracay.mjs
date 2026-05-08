/**
 * Concept 09 — "White Beach Has No Noise" — EXACT prompts, no filtering
 * Step 1: 4-panel model turnaround (front / left / back / right)
 * Slides 1–5: verbatim prompts from the concept brief
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-zV3e9QZ6h71CboFraCbRkmMMXSIwEiwf48tL2nB6NzgqThM7';
const BASE_URL = 'https://token.ithinkai.cn';
const PRODUCT_PATH = 'C:/Users/miuri/Downloads/821b1999-dc9f-40d7-9d04-0ff019299c34.jpg';

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
      size: '1024x1024',
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
    console.log(`❌ ${res.status} in ${e}s — ${txt.slice(0, 300)}`);
    return null;
  }
  const d = await res.json();
  const item = d.data?.[0];
  const buf = item?.url
    ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
    : Buffer.from(item.b64_json, 'base64');
  const p = `test-output/c09v2-${label}-${Date.now()}.jpeg`;
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

    const t0 = Date.now();
    process.stdout.write(`[${label}] attempt ${attempt}/${MAX_ATTEMPTS}... `);

    try {
      const res = await fetch(`${BASE_URL}/v1/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}` },
        body: form,
      });
      const e = ((Date.now() - t0) / 1000).toFixed(1);
      if (!res.ok) {
        const txt = await res.text();
        const code = res.status;
        console.log(`❌ ${code} in ${e}s — ${txt.slice(0, 200)}`);
        if (attempt < MAX_ATTEMPTS && (code === 524 || code === 503 || code === 554 || code === 500)) continue;
        return null;
      }
      const d = await res.json();
      const item = d.data?.[0];
      const buf = item?.url
        ? Buffer.from(await (await fetch(item.url)).arrayBuffer())
        : Buffer.from(item.b64_json, 'base64');
      const p = `test-output/c09v2-${label}-${Date.now()}.jpeg`;
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

// ── STEP 1: 4-panel model turnaround ─────────────────────────────────────────
console.log('\n══ STEP 1: 4-Panel Model Reference ══');
const MODEL_4PANEL_PROMPT =
  'Character reference sheet — 4 panels side by side in a single image: front view, left side view, back view, right side view. ' +
  'Subject: Filipina model, approx. 22–25 years old. Fair warm mestiza skin — light golden-beige with a natural sun-kissed glow across her nose and shoulders, not pale or washed out. Soft oval face, high nose bridge, large expressive dark eyes fully open with a calm and quietly confident gaze. Full lips, natural brow shape. A small beauty mark near her jaw. ' +
  'Hair: Long, glossy dark brown hair — worn in a loose, slightly undone low chignon with soft face-framing tendrils falling at the temples. A few strands lifted gently by the beach breeze. ' +
  'Wearing: A Deep Teal (#1D4E56) minimal string bikini — thin straps, clean triangles, premium feel. Over this, a completely sheer Warm Cream (#FDFDFC) linen kaftan — floor-length, loose, nearly transparent in the backlit morning sun, tied loosely at the waist. Barefoot. No jewelry. No sunglasses. ' +
  'All 4 panels show the same model, same outfit, neutral white studio background, full body head to toe. Equal panel sizes, clean dividers between panels. ' +
  'Front panel: facing camera directly, arms relaxed at sides, weight on one hip. ' +
  'Left panel: 90-degree left profile, looking straight ahead. ' +
  'Back panel: facing away from camera, showing hair chignon and kaftan drape. ' +
  'Right panel: 90-degree right profile, looking straight ahead. ' +
  'Photorealistic, editorial quality, even studio lighting, no shadows.';

const modelBuf = await generate(MODEL_4PANEL_PROMPT, 'step1-model-4panel');
if (!modelBuf) { console.log('Model generation failed. Exiting.'); process.exit(1); }

const productBuf = fs.readFileSync(PRODUCT_PATH);

// ── SLIDE 1: Hook + Text Overlay — EXACT PROMPT ───────────────────────────────
console.log('\n══ SLIDE 1: Hook + Text Overlay ══');
const SLIDE1_PROMPT =
  'Image 1 = the model reference. ' +
  'Shot in the visual language of iSupply Philippines 2026 rebrand "Accessible Tranquility." Wide medium portrait of a Filipina model (approx. 22–25, fair warm mestiza skin with a natural sun-kissed glow, large calm dark eyes fully open, soft oval face, long glossy dark brown hair in a loose low chignon with face-framing tendrils, Deep Teal string bikini beneath a sheer floor-length Warm Cream linen kaftan loosely tied at waist) standing barefoot on Boracay\'s White Beach at early morning — the iconic powdery white sand stretching wide in both directions, the Sibuyan Sea calm and glassy in seafoam green and teal tones behind her. She faces the camera, gaze calm and open, weight on one hip, arms loose. Image 2 = iSupply Pro 2 earbuds (glossy white stem-style, dark oval acoustic mesh grille, silver L/R engravings) — in both her ears. The sheer kaftan catches the soft early golden morning light — backlit and luminous. Upper 30% of frame: overexposed pale Warm Cream (#FDFDFC) sky — clean negative space. Shallow depth of field f/1.8 — White Beach shoreline and sea dissolve into seafoam and cream bokeh. Color grade: warm cream highlights, lifted shadows, subtle teal cast in shadow areas, Filipino skin tone warmth preserved. 4:5 ratio. The image has a clean text overlay placed in the upper sky negative space. The text is Midnight Ocean (#0D2B33) in a geometric sans-serif font (Jost 400 style, wide letter-spacing 0.78px equivalent, airy and unhurried, never bold) at a large display scale — approximately 7–9% of frame height — that reads exactly: "boracay at 5am belongs to no one. find it anyway." Three lines, left-aligned with consistent left margin, generous line spacing. No drop shadow, no outline, no decorative elements.';

const slide1 = await edit([modelBuf, productBuf], SLIDE1_PROMPT, 'slide1-hook');

// ── SLIDE 2: Walking Shoreline — EXACT PROMPT ────────────────────────────────
console.log('\n══ SLIDE 2: Walking Shoreline ══');
const SLIDE2_PROMPT =
  'Image 1 = the model reference. ' +
  'Model Base: same Filipina from Image 1, sheer cream kaftan over Deep Teal bikini, hair in loose chignon. Walking slowly along the very edge of Boracay White Beach shoreline at golden hour — bare feet in the wet white sand, shallow clear water washing around her ankles, the iconic row of leaning coconut palms blurred in the distant background. Shot from slightly behind and to the side — three-quarter rear angle, her face in soft profile turning gently toward the calm sea. Image 2 = iSupply Pro 2 earbud visible in the near ear. The kaftan billows softly with the breeze, catching the early light. Upper 35% of frame: overexposed warm cream and pale gold sky. Wet white sand reflecting light at her feet. f/2.0. 4:5 ratio. No text. Mood: the beach is entirely hers. She is in no hurry to share it.';

const slide2 = await edit([modelBuf, productBuf], SLIDE2_PROMPT, 'slide2-shoreline');

// ── SLIDE 3: Flat-lay — EXACT PROMPT ─────────────────────────────────────────
console.log('\n══ SLIDE 3: Flat-lay ══');
const SLIDE3_PROMPT =
  'Image 1 = iSupply Pro 2 product reference. ' +
  'Overhead flat-lay editorial on the fine white powdery sand of White Beach, Boracay. iSupply Pro 2 charging case (open, both earbuds nestled inside, green LED lit) centered in the lower third of frame. Beside it: a pair of cream linen sandals, a smooth pale shell, a single small dried frangipani flower. The Boracay white sand fills 55% of the frame in pure luminous negative space — catching the morning sun. Shot from directly above. Bright even morning coastal light — one clean soft shadow from the case. 4:5 ratio. No text. No model. Mood: she is already in the water. This is what she left behind.';

const slide3 = await edit([productBuf], SLIDE3_PROMPT, 'slide3-flatlay');

// ── SLIDE 4: Close-up Portrait — EXACT PROMPT ────────────────────────────────
console.log('\n══ SLIDE 4: Close-up Portrait ══');
const SLIDE4_PROMPT =
  'Image 1 = the model reference. ' +
  'Model Base: same Filipina from Image 1. Close-up portrait — chest up, the Boracay sea and distant palm-lined shore softly blurred behind her. She is looking directly into the camera, eyes open and warm, a quiet private smile. The sheer kaftan draped loosely off one shoulder — natural and effortless. Image 2 = iSupply Pro 2 earbuds in both ears, stems catching the golden morning light. Fair warm skin glowing softly in the hazy coastal sun. Behind: Seafoam Green (#A8D5C2) Sibuyan Sea and Warm Cream sky — 35% upper negative space, f/1.8 bokeh. 4:5 ratio. No text. Mood: this is her Boracay. Not the crowded one. This one.';

const slide4 = await edit([modelBuf, productBuf], SLIDE4_PROMPT, 'slide4-portrait');

// ── SLIDE 5: Seated — EXACT PROMPT ───────────────────────────────────────────
console.log('\n══ SLIDE 5: Seated ══');
const SLIDE5_PROMPT =
  'Image 1 = the model reference. ' +
  'Model Base: same Filipina from Image 1, seated on a natural bamboo beach lounger at the edge of the White Beach shoreline, the Sibuyan Sea stretching wide behind her. One leg extended, the other knee drawn up, kaftan pooled softly around her. Both hands wrapped around a small cream ceramic mug. Eyes open, gaze resting on the calm sea — present, not performing. Image 2 = iSupply Pro 2 earbuds in both ears. Early golden-hour light warming her skin and the cream kaftan from the right. Behind: the iconic Boracay horizon — teal sea meeting a pale cream sky — 40% upper negative space, f/2.0 bokeh. 4:5 ratio. No text. Mood: this is what she came for. Nothing more. Nothing less.';

const slide5 = await edit([modelBuf, productBuf], SLIDE5_PROMPT, 'slide5-seated');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══ DONE ══');
const results = { slide1, slide2, slide3, slide4, slide5 };
for (const [k, v] of Object.entries(results)) {
  console.log(`${k}: ${v ? '✅' : '❌'}`);
}
