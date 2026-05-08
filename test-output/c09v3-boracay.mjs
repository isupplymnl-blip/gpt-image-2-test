/**
 * Concept 09 v3 — Agent-compliant prompts
 *
 * KEY RULES APPLIED (from agent system):
 * - Director rule: ref image = WHO. Text prompt = WHERE/HOW only. No model re-description.
 * - openai-prompting.md: Scene → Subject → Details → Typography → Constraints
 * - Multi-ref labeling: Image 1 = role, Image 2 = role
 * - Lighting FIRST (Agent 3): SOURCE + DIRECTION + QUALITY + TEMP K + SHADOW
 * - Content filter: publication anchor on line 1, camera specs first
 * - Prompt length: ~400–600 chars per slide to stay under iThink's compute limit
 * - "No extra text, no duplicate letters" constraint on typography slides
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

async function generate(prompt, label, size = '1024x1024') {
  const ac = new AbortController();
  const t0 = Date.now();
  process.stdout.write(`[${label}] generating... `);
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size, quality: 'medium', output_format: 'jpeg', moderation: 'low', n: 1 }),
    signal: ac.signal,
  });
  const e = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) { const t = await res.text(); console.log(`❌ ${res.status} in ${e}s — ${t.slice(0, 200)}`); return null; }
  const d = await res.json();
  const item = d.data?.[0];
  const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
  const p = `test-output/c09v3-${label}-${Date.now()}.jpeg`;
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
        method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
      });
      const e = ((Date.now() - t0) / 1000).toFixed(1);
      if (!res.ok) {
        const txt = await res.text(); const code = res.status;
        console.log(`❌ ${code} in ${e}s — ${txt.slice(0, 150)}`);
        if (attempt < MAX_ATTEMPTS && (code === 524 || code === 503 || code === 554 || code === 500)) continue;
        return null;
      }
      const d = await res.json(); const item = d.data?.[0];
      const buf = item?.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : Buffer.from(item.b64_json, 'base64');
      const p = `test-output/c09v3-${label}-${Date.now()}.jpeg`;
      fs.writeFileSync(p, buf);
      console.log(`✅ ${e}s → ${p} (${Math.round(buf.length / 1024)}KB)`);
      return buf;
    } catch (err) {
      const e = (((Date.now() - t0) / 1000)).toFixed(1);
      console.log(`❌ ${err.message} in ${e}s`);
      if (attempt < MAX_ATTEMPTS) continue;
      return null;
    }
  }
  return null;
}

// ── STEP 1: 4-panel model reference ──────────────────────────────────────────
// Agent 2 rules: 6-dimension framework, skin formula (TONE+TEXTURE+LIGHT),
// anti-plastic phrase, full wardrobe taxonomy. Text-only generation (no refs).
// DO NOT use this in slide prompts — ref image takes over from here.
console.log('\n══ STEP 1: 4-Panel Model Reference ══');
const MODEL_PROMPT =
'Character reference sheet, 4 equal panels side by side: [FRONT] [3/4 LEFT] [BACK] [3/4 RIGHT]. Neutral white studio, even light, no shadows, full body head to toe. ' +
'Filipina woman 22–25. Fitzpatrick III–IV: warm caramel-golden mestiza skin, natural sun-kissed glow on nose and shoulders, visible micro-texture, warm specular on cheekbones — authentic skin not airbrushed. Soft oval face, high nose bridge, large dark expressive eyes fully open, calm confident gaze, full lips, natural brows, small beauty mark near jaw. ' +
'Hair: long glossy dark brown, loose slightly undone low chignon, soft face-framing tendrils at temples, a few windswept strands. ' +
'Outfit: Deep Teal (#1D4E56) minimal string bikini — thin straps, clean triangles, premium construction. Over it: completely sheer Warm Cream (#FDFDFC) floor-length linen kaftan, loose, nearly transparent, tied loosely at waist. Barefoot. No jewelry. No sunglasses. ' +
'Front panel: faces camera directly, weight on one hip, arms relaxed. 3/4 left: 45° left profile. Back panel: fully facing away, chignon and kaftan drape visible. 3/4 right: 45° right profile. ' +
'Photorealistic editorial quality. Equal panel widths. Clean panel dividers.';

console.log(`Model prompt: ${MODEL_PROMPT.length}c`);
const modelBuf = await generate(MODEL_PROMPT, 'step1-model-4panel', '1792x1024');
if (!modelBuf) { console.log('Model failed. Exiting.'); process.exit(1); }

const productBuf = fs.readFileSync(PRODUCT_PATH);

// ── SLIDES 1–5: define prompts ────────────────────────────────────────────────
const SLIDE1 =
'Image 1 = model reference — keep exact face, hair, kaftan, pose energy. Image 2 = iSupply Pro 2 earbud — worn in both ears. ' +
'iSupply Philippines 2026 editorial, Canon EOS R5, 85mm f/1.8, wide medium shot, 4:5 vertical. ' +
'LIGHTING: Warm backlit morning sun from camera-right 10° above horizon, 3000K, golden rim light on shoulder and hair edge, sheer kaftan luminous and transparent in backlight. ' +
'SETTING: Boracay White Beach early morning. Powdery white sand wide in both directions, Sibuyan Sea calm seafoam-teal behind her. Upper 30% frame: overexposed pale Warm Cream sky — clean negative space. f/1.8 bokeh — shoreline dissolves into cream and seafoam. ' +
'TYPOGRAPHY in upper sky: Midnight Ocean (#0D2B33), Jost-style geometric sans-serif, wide letter-spacing, left-aligned, large display, 3 lines exactly — "boracay at 5am" / "belongs to no one." / "find it anyway." No drop shadow. No outline. ' +
'No extra text. No duplicate letters. Keep outfit from Image 1 unchanged.';

const SLIDE2 =
'Image 1 = model reference — keep exact same person, kaftan, hair. Image 2 = iSupply Pro 2 earbud — visible in near ear. ' +
'iSupply Philippines 2026 editorial, 85mm f/2.0, 4:5 vertical. ' +
'LIGHTING: Warm directional golden-hour sunlight from camera-right 15° above horizon, 3000K, long soft shadows, golden specular on hair and kaftan edge. ' +
'SETTING: Three-quarter rear angle — model walking slowly at Boracay White Beach shoreline. Bare feet in wet white sand, shallow clear water around ankles. Leaning coconut palms blurred in distance. Kaftan billows softly in breeze. Upper 35% overexposed warm cream and pale gold sky. Wet sand reflects light at feet. ' +
'No text. No extra elements. Keep model identity from Image 1 unchanged.';

const SLIDE3 =
'Image 1 = iSupply Pro 2 product reference — glossy white earbud case, open, both earbuds nested inside, green LED lit. ' +
'Overhead flat-lay, shot directly from above, 4:5 vertical. ' +
'LIGHTING: Bright even morning coastal light, 5500K, one clean soft shadow falling from case. ' +
'SETTING: Fine powdery white Boracay sand fills 55% of frame as pure luminous negative space. Lower third: earbud case centered, open lid facing camera — case matches Image 1 exactly. Beside it: cream linen sandals (left), smooth pale shell (right), single dried frangipani flower (front-right). ' +
'No model. No text. No extra objects. Product case must match Image 1 shape, material, color exactly.';

const SLIDE4 =
'Image 1 = model reference — keep exact face, hair, kaftan. Image 2 = iSupply Pro 2 earbud — in both ears, stems catching light. ' +
'iSupply Philippines 2026 editorial, 85mm f/1.8, close-up portrait chest-up, 4:5 vertical. ' +
'LIGHTING: Soft hazy golden morning sunlight from camera-right, 3200K, warm glow on skin, gentle specular on earbud stems. ' +
'SETTING: Camera faces model directly — Sibuyan Sea and distant palm-lined shore in soft bokeh behind her. Seafoam green water and warm cream sky, 35% upper negative space. Kaftan draped loosely off one shoulder. Direct warm gaze into camera, quiet private smile. ' +
'No text. Keep face and identity from Image 1 exactly.';

const SLIDE5 =
'Image 1 = model reference — keep exact person, kaftan, hair. Image 2 = iSupply Pro 2 earbud — in both ears. ' +
'iSupply Philippines 2026 editorial, 85mm f/2.0, medium shot, 4:5 vertical. ' +
'LIGHTING: Early golden-hour sunlight from camera-right, 3000K, warming skin and cream kaftan, long soft shadows to left. ' +
'SETTING: Model seated on natural bamboo beach lounger at White Beach shoreline. Sibuyan Sea wide behind her. One leg extended, other knee drawn up, kaftan pooled around her. Both hands around small cream ceramic mug, eyes resting on calm sea — present, not performing. Teal sea meets pale cream sky, 40% upper negative space, f/2.0 bokeh. ' +
'No text. Keep model identity from Image 1 unchanged.';

for (const [label, len] of [['slide1',SLIDE1],['slide2',SLIDE2],['slide3',SLIDE3],['slide4',SLIDE4],['slide5',SLIDE5]])
  console.log(`${label} prompt: ${len.length}c`);

// ── Fire all 5 slides in parallel ────────────────────────────────────────────
console.log('\n══ Firing all 5 slides in parallel... ══');
const [slide1, slide2, slide3, slide4, slide5] = await Promise.all([
  edit([modelBuf, productBuf], SLIDE1, 'slide1-hook'),
  edit([modelBuf, productBuf], SLIDE2, 'slide2-shoreline'),
  edit([productBuf],           SLIDE3, 'slide3-flatlay'),
  edit([modelBuf, productBuf], SLIDE4, 'slide4-portrait'),
  edit([modelBuf, productBuf], SLIDE5, 'slide5-seated'),
]);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n══ DONE ══');
for (const [k, v] of Object.entries({ slide1, slide2, slide3, slide4, slide5 }))
  console.log(`${k}: ${v ? '✅' : '❌'}`);
