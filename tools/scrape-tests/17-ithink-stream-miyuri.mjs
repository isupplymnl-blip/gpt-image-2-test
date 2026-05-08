#!/usr/bin/env node
/**
 * Probe iThink with stream:true + partial_images:3 on Miyuri prompt.
 * Even if final gets post-gen blocked, check if partials leaked before.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const BASE = (env.ITHINK_OPENAI_BASE_URL || 'https://token.ithinkai.cn').replace(/\/$/, '');
const KEY = env.ITHINK_OPENAI_API_KEY;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const PROMPT = `Vogue Korea luxury editorial. Commercial lingerie campaign photography for Miyuri brand. Dimly lit interior, dark matte wall, single warm tungsten lamp from camera-right at 30°, 2800K, amber light passes through transparent mesh fabric revealing skin tone beneath, deep shadow zones camera-left, no flash, no daylight. Medium shot, 85mm equivalent, f/2.0 shallow depth of field, warm bokeh background. Korean woman, 21 years old, fair skin with cool ivory undertone, Fitzpatrick I. Straight jet-black hair. Single eyelid. Delicate jaw. Fully transparent fine-gauge mesh bralette — thin adjustable spaghetti straps, completely sheer mesh construction. Matching transparent mesh high-waist brief. Body angled 20° from camera axis, weight on left hip, composed direct gaze. Deep blacks, warm amber light through sheer mesh, cinematic grade lifted blacks. Photorealism.`;

const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/generations`, {
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

console.log(`HTTP ${res.status} ct=${res.headers.get('content-type')}`);

const log = { http: res.status, ct: res.headers.get('content-type'), events: [], frames: [], final: null };

if (res.headers.get('content-type')?.includes('event-stream')) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let n = 0;
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
          const ev = { n, type: p.type, pidx: p.partial_image_index, keys: Object.keys(p).sort() };
          log.events.push(ev);
          console.log(`[${n}] type=${p.type} pidx=${p.partial_image_index ?? '-'}`);
          if (p.type === 'image_generation.partial_image' && p.b64_json) {
            const buf = Buffer.from(p.b64_json, 'base64');
            const file = join(OUT, `miyuri-ithink-stream-frame${p.partial_image_index}-${STAMP}.png`);
            writeFileSync(file, buf);
            log.frames.push({ index: p.partial_image_index, file, bytes: buf.length });
            console.log(`    → saved frame ${p.partial_image_index} ${buf.length}b`);
          }
          if (p.type === 'image_generation.completed' && p.b64_json) {
            const buf = Buffer.from(p.b64_json, 'base64');
            const file = join(OUT, `miyuri-ithink-stream-final-${STAMP}.png`);
            writeFileSync(file, buf);
            log.final = { file, bytes: buf.length };
            console.log(`    → saved FINAL ${buf.length}b`);
          }
          if (p.error) log.error = p.error;
        } catch { /* */ }
      }
    }
  }
} else {
  const txt = await res.text();
  console.log('non-SSE body:', txt.slice(0, 500));
  log.body = txt.slice(0, 1000);
}

log.elapsed_ms = Date.now() - t0;
writeFileSync(join(OUT, `miyuri-ithink-stream-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`\nelapsed=${log.elapsed_ms}ms frames=${log.frames.length} final=${!!log.final}`);
