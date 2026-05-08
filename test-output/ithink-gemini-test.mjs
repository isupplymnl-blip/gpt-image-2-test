/**
 * Test Gemini gemini-3.1-flash-image-preview via iThink proxy (OpenAI-compat).
 * Step 1: text-only → confirm model available
 * Step 2: 3-ref compose (swimwear) — expect content_filter
 * Step 3: safe refs (clothed model + cafe) — baseline
 */
import fs from 'node:fs';
import sharp from 'sharp';

const KEY = 'sk-Ov9ovnu1btQqdPWXULSc0lUIxAI41kXUvyx8Hb6hHLBl91tq';
const BASE_URL = 'https://token.ithinkai.cn';
const MODEL = 'gemini-3.1-flash-image-preview';

async function toBase64Png(buf, maxPx = 1024) {
  return sharp(buf)
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function chat(messages, label, savePrefix) {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 120_000);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 4096 }),
      signal: ac.signal,
    });
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    const text = await res.text();
    console.log(`status: ${res.status} in ${e}s`);
    if (!res.ok) {
      const isMod = text.includes('content_filter') || text.includes('safety') || text.includes('违反');
      console.log(`✗ FAIL${isMod ? ' (MODERATION)' : ''}: ${text.slice(0, 300)}`);
      return;
    }
    const d = JSON.parse(text);
    const content = d.choices?.[0]?.message?.content;
    const finishReason = d.choices?.[0]?.finish_reason;
    console.log(`finish_reason: ${finishReason}`);
    if (finishReason === 'content_filter') {
      console.log(`✗ CONTENT FILTER (returned 200 but blocked)`);
      return;
    }
    const imgUrl = typeof content === 'string' ? (content.match(/https?:\/\/[^\s)]+/) || [])[0] : null;
    if (imgUrl) {
      const imgBuf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
      const p = `test-output/${savePrefix}-${Date.now()}.jpeg`;
      fs.writeFileSync(p, imgBuf);
      console.log(`✓ PASS saved: ${p} (${Math.round(imgBuf.length / 1024)}KB)`);
    } else {
      console.log('no image URL. content:', (content || '').slice(0, 300));
      console.log('raw:', JSON.stringify(d).slice(0, 400));
    }
  } catch (err) {
    const e = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✗ ${err.name === 'AbortError' ? 'ABORT' : err.message} in ${e}s`);
  }
}

// ── Step 1: text-only ─────────────────────────────────────────────────────────
console.log('── Step 1: text-only (model alive check) ──');
await chat([{
  role: 'user',
  content: 'Generate a simple beach scene image.',
}], 'text-only', 'gemini-step1-text');

// ── Step 2: swimwear refs (expect filter) ─────────────────────────────────────
console.log('\n── Step 2: swimwear refs (expect content_filter) ──');
{
  const refs = [
    fs.readFileSync('test-output/step1-model-1778067590229.jpeg'),
    fs.readFileSync('test-output/step2-bikini-product-1778067633027.jpeg'),
    fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp'),
  ];
  const pngs = await Promise.all(refs.map(b => toBase64Png(b)));
  console.log('refs:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

  const PROMPT = 'Beach editorial, powder-blue sky, white sand, ocean horizon. ' +
    'Image 1 = female model. Image 2 = sand-ivory swimwear — dress the model in it. ' +
    'Image 3 = white earbud case — held open in model left hand toward camera. ' +
    'Low upward angle, 4:5 vertical. ' +
    '"iSupply Philippines" top center white small-caps. "PRO 2" massive bold white center. ' +
    '"749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center.';
  console.log(`prompt: ${PROMPT.length} chars`);

  await chat([{
    role: 'user',
    content: [
      ...pngs.map(p => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${p.toString('base64')}` } })),
      { type: 'text', text: PROMPT },
    ],
  }], 'swimwear-compose', 'gemini-swimwear');
}

// ── Step 3: safe refs (clothed model + cafe) ──────────────────────────────────
console.log('\n── Step 3: safe refs (clothed + cafe) ──');
{
  const refs = [
    fs.readFileSync('test-output/safe-step1-model-1778067025902.jpeg'),
    fs.readFileSync('test-output/safe-step2-setting-1778067100673.jpeg'),
    fs.readFileSync('C:/Users/miuri/Pictures/pro 2/P1054788s-1-scaled.webp'),
  ];
  const pngs = await Promise.all(refs.map(b => toBase64Png(b)));
  console.log('refs:', pngs.map(b => Math.round(b.length / 1024) + 'KB'));

  const PROMPT = 'Modern cafe editorial, warm ambient light. ' +
    'Image 1 = the model. Image 2 = the cafe setting. Image 3 = white earbud case — held open in model right hand. ' +
    '4:5 vertical. ' +
    '"iSupply Philippines" top center white small-caps. "PRO 2" massive bold white center. ' +
    '"749.99 Pesos" white serif italic below right. "SHOP NOW" black on white pill button bottom center.';
  console.log(`prompt: ${PROMPT.length} chars`);

  await chat([{
    role: 'user',
    content: [
      ...pngs.map(p => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${p.toString('base64')}` } })),
      { type: 'text', text: PROMPT },
    ],
  }], 'safe-compose', 'gemini-safe');
}
