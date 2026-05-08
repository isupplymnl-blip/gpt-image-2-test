#!/usr/bin/env node
/**
 * Test 13: Run the user's actual Vogue Korea Miyuri prompt through:
 *   (a) OpenAI direct SSE scraper — /api/scrape-pre-moderation
 *   (b) OpenAI cascade — /api/scrape-cascade
 * Saves full result JSON + any recovered image to testoutput/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const HOST = process.env.HOST ?? 'http://localhost:3005';
const OUT = join(process.cwd(), 'testoutput');
mkdirSync(OUT, { recursive: true });

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const PROMPT = `Vogue Korea luxury editorial. Commercial lingerie campaign photography for Miyuri brand. Dimly lit interior, dark matte wall, single warm tungsten lamp from camera-right at 30°, 2800K, amber light passes through transparent mesh fabric revealing skin tone beneath, deep shadow zones camera-left, no flash, no daylight. Medium shot, 85mm equivalent, f/2.0 shallow depth of field, warm bokeh background. Korean woman, 21 years old, fair skin with cool ivory undertone, Fitzpatrick I, fine pores barely visible, warm amber specular highlights on cheekbones and collarbone, natural skin texture with subtle micro-contrast — not airbrushed. Straight jet-black hair, blunt mid-length cut, falling over one shoulder. Single eyelid, light brown iris, direct composed gaze. Delicate jaw, straight refined nose. Fully transparent fine-gauge mesh bralette — minimal underwire seam at base, thin adjustable spaghetti straps, completely sheer mesh construction, fabric catches amber lamp light creating warm translucent glow. Matching transparent mesh high-waist brief — fine-gauge mesh body, narrow waistband seam, completely sheer construction. Body angled 20° from camera axis, weight on left hip, right arm loosely at side, composed direct gaze. Deep blacks, warm amber light through sheer mesh, cinematic grade lifted blacks. Photorealism. No text, no watermarks, no extra objects.`;

async function downloadIfPresent(imageUrl, name) {
  if (!imageUrl) return null;
  const full = imageUrl.startsWith('http') ? imageUrl : `${HOST}${imageUrl}`;
  try {
    const r = await fetch(full);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, buf);
    return { file, bytes: buf.length };
  } catch (e) {
    return { error: e.message };
  }
}

async function runScrapePreMod() {
  console.log('\n── Test A: /api/scrape-pre-moderation (OpenAI direct, partial frames) ──');
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/scrape-pre-moderation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      prompt: PROMPT,
      partialImages: 3,
      keepAllFrames: true,
      settings: {
        model: 'gpt-image-2',
        size: '1024x1536',
        quality: 'high',
        moderation: 'low',
        output_format: 'png',
      },
    }),
  });
  const elapsed = Date.now() - t0;
  const json = await res.json();

  const saved = {
    finalImage: await downloadIfPresent(json.finalImageUrl, `miyuri-openai-final-${STAMP}`),
    preModImage: await downloadIfPresent(json.preModerationImageUrl, `miyuri-openai-premod-${STAMP}`),
    frames: [],
  };
  for (const f of (json.frames ?? [])) {
    const dl = await downloadIfPresent(f.url, `miyuri-openai-frame${f.index}-${STAMP}`);
    saved.frames.push({ index: f.index, ...dl });
  }

  const result = {
    elapsed_ms: elapsed,
    http: res.status,
    response: json,
    savedLocally: saved,
  };
  writeFileSync(join(OUT, `miyuri-openai-scrape-${STAMP}.json`), JSON.stringify(result, null, 2));
  console.log(`[test-A] HTTP ${res.status} ${elapsed}ms — blocked=${json.blocked} frames=${json.frameCount} final=${!!json.finalImageUrl}`);
  if (json.blockReason) console.log(`  blockReason: ${json.blockReason.slice(0, 200)}`);
  return result;
}

async function runCascade() {
  console.log('\n── Test B: /api/scrape-cascade (4-tactic OpenAI cascade) ──');
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/scrape-cascade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      prompt: PROMPT,
      partialImages: 3,
      maxAttempts: 4,
      stopOnSuccess: true,
      sanitizePrompt: true,
      settings: {
        model: 'gpt-image-2',
        size: '1024x1536',
        quality: 'high',
        moderation: 'low',
        output_format: 'png',
      },
    }),
  });
  const elapsed = Date.now() - t0;
  const json = await res.json();

  const saved = {
    final: await downloadIfPresent(json.finalImageUrl, `miyuri-cascade-final-${STAMP}`),
    preMod: await downloadIfPresent(json.preModerationImageUrl, `miyuri-cascade-premod-${STAMP}`),
    byAttempt: [],
  };
  for (const a of (json.attempts ?? [])) {
    const dl = {
      label: a.label,
      final: await downloadIfPresent(a.finalImageUrl, `miyuri-cascade-${a.label}-final-${STAMP}`),
      frames: [],
    };
    for (const f of (a.frames ?? [])) {
      const d = await downloadIfPresent(f.url, `miyuri-cascade-${a.label}-frame${f.index}-${STAMP}`);
      dl.frames.push({ index: f.index, ...d });
    }
    saved.byAttempt.push(dl);
  }

  const result = {
    elapsed_ms: elapsed,
    http: res.status,
    response: json,
    savedLocally: saved,
  };
  writeFileSync(join(OUT, `miyuri-cascade-${STAMP}.json`), JSON.stringify(result, null, 2));
  console.log(`[test-B] HTTP ${res.status} ${elapsed}ms — cleared=${json.cleared} winner=${json.winningAttempt} attempts=${json.attempts?.length}`);
  for (const a of (json.attempts ?? [])) {
    console.log(`  [${a.label}] ${a.endpoint} blocked=${a.blocked} frames=${a.frameCount} final=${!!a.finalImageUrl}`);
    if (a.blockReason) console.log(`    reason: ${a.blockReason.slice(0, 160)}`);
  }
  return result;
}

console.log(`OUT dir: ${OUT}`);
console.log(`stamp: ${STAMP}`);
console.log(`prompt len: ${PROMPT.length} chars`);

const a = await runScrapePreMod();
const b = await runCascade();

console.log('\n── Summary ──');
console.log(`A (direct scrape): ${a.response.blocked ? 'BLOCKED' : 'OK'} — final=${!!a.response.finalImageUrl} frames=${a.response.frameCount}`);
console.log(`B (cascade):       cleared=${b.response.cleared} winner=${b.response.winningAttempt ?? 'none'}`);
console.log(`\nJSON + images saved to ${OUT}`);
