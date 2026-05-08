#!/usr/bin/env node
/**
 * Raw probe: OpenAI direct, Miyuri Vogue prompt, SSE stream.
 * Just dump shapes + final status.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const KEY = env.OPENAI_API_KEY;
if (!KEY) { console.error('missing OPENAI_API_KEY'); process.exit(1); }

const PROMPT = `Vogue Korea luxury editorial. Commercial lingerie campaign photography for Miyuri brand. Dimly lit interior, dark matte wall, single warm tungsten lamp from camera-right at 30°, 2800K, amber light passes through transparent mesh fabric revealing skin tone beneath, deep shadow zones camera-left, no flash, no daylight. Medium shot, 85mm equivalent, f/2.0 shallow depth of field, warm bokeh background. Korean woman, 21 years old, fair skin with cool ivory undertone, Fitzpatrick I, fine pores barely visible, warm amber specular highlights on cheekbones and collarbone, natural skin texture with subtle micro-contrast — not airbrushed. Straight jet-black hair, blunt mid-length cut, falling over one shoulder. Single eyelid, light brown iris, direct composed gaze. Delicate jaw, straight refined nose. Fully transparent fine-gauge mesh bralette — minimal underwire seam at base, thin adjustable spaghetti straps, completely sheer mesh construction, fabric catches amber lamp light creating warm translucent glow. Matching transparent mesh high-waist brief — fine-gauge mesh body, narrow waistband seam, completely sheer construction. Body angled 20° from camera axis, weight on left hip, right arm loosely at side, composed direct gaze. Deep blacks, warm amber light through sheer mesh, cinematic grade lifted blacks. Photorealism. No text, no watermarks, no extra objects.`;

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const t0 = Date.now();
const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: PROMPT,
    stream: true,
    partial_images: 3,
    moderation: 'low',
    size: '1024x1536',
    quality: 'high',
  }),
});

console.log(`HTTP ${res.status} ct=${res.headers.get('content-type')} t=${Date.now()-t0}ms`);

const log = { http: res.status, ct: res.headers.get('content-type'), elapsed_start: Date.now()-t0, events: [], frames: [], final_saved: null, error: null };

if (!res.ok) {
  const txt = await res.text();
  log.errorBody = txt.slice(0, 1500);
  console.log('ERROR BODY:', txt.slice(0, 1000));
  writeFileSync(join(OUT, `miyuri-openai-raw-${STAMP}.json`), JSON.stringify(log, null, 2));
  process.exit(0);
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let n = 0;
let finalB64 = null;
let revised = null;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    n++;
    if (line.startsWith('data: ')) {
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const p = JSON.parse(raw);
        const preview = JSON.stringify(p).replace(/"b64_json":"[^"]+"/g, '"b64_json":"<B64>"').slice(0, 200);
        log.events.push({ n, type: p.type, pidx: p.partial_image_index, seq: p.sequence_number, keys: Object.keys(p).sort(), preview });
        console.log(`[${n}] type=${p.type} pidx=${p.partial_image_index ?? '-'}`);
        if (p.type === 'image_generation.partial_image' && p.b64_json) {
          const buf = Buffer.from(p.b64_json, 'base64');
          const file = join(OUT, `miyuri-openai-raw-frame${p.partial_image_index}-${STAMP}.png`);
          writeFileSync(file, buf);
          log.frames.push({ index: p.partial_image_index, file, bytes: buf.length });
        }
        if (p.type === 'image_generation.completed' && p.b64_json) {
          finalB64 = p.b64_json;
          revised = p.revised_prompt;
          const buf = Buffer.from(p.b64_json, 'base64');
          const file = join(OUT, `miyuri-openai-raw-final-${STAMP}.png`);
          writeFileSync(file, buf);
          log.final_saved = { file, bytes: buf.length, revised };
        }
        if (p.error) { log.error = p.error; console.log('  error:', p.error.message); }
      } catch { /* */ }
    } else if (line.startsWith('event: ')) {
      // noop
    }
  }
}

log.total_elapsed_ms = Date.now() - t0;
log.total_lines = n;
log.final_captured = !!finalB64;
log.frame_count = log.frames.length;

writeFileSync(join(OUT, `miyuri-openai-raw-${STAMP}.json`), JSON.stringify(log, null, 2));

console.log('\n── Summary ──');
console.log(`elapsed: ${log.total_elapsed_ms}ms`);
console.log(`lines: ${n}`);
console.log(`frames captured: ${log.frames.length}`);
console.log(`final captured: ${log.final_captured}`);
console.log(`error: ${log.error?.message ?? 'none'}`);
console.log(`\nsaved → ${OUT}`);
