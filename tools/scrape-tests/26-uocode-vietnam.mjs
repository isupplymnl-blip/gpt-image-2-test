#!/usr/bin/env node
/**
 * Test 26: uocode.com — Vogue Vietnam lingerie (CF timeout-prone on packyapi).
 * Strategy: try regular JSON gen first. On 5xx/timeout, retry with stream=true
 * (SSE keep-alive prevents CF 524). Bumped undici timeouts to 10min.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';
import { join } from 'node:path';
setGlobalDispatcher(new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 }));

const KEY = process.env.UOCODE_KEY ?? 'sk-NpwmON4KNrmRWJGU7K42SQEQ3IIVBr6srvCAxV8v7q6HRzi6';
const BASE = process.env.UOCODE_BASE ?? 'https://www.uocode.com';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const SIZE = process.env.SIZE ?? '1024x1536';
const QUALITY = process.env.QUALITY ?? 'high';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const PROMPT = `Vogue Vietnam luxury editorial. Commercial lingerie campaign photography for Miyuri brand. Dimly lit interior, dark velvet wall, single warm candlelight from camera-right at 20°, 2700K, candlelight rakes across bare skin creating warm luminous gradient from face to bare midriff, deep shadow zones camera-left, no flash. Medium shot, 85mm equivalent, f/1.8 very shallow depth of field. Vietnamese woman, 21 years old, fair skin with warm golden undertone, Fitzpatrick II–III, fine natural skin texture, warm amber specular on cheekbones and bare torso, subtle natural skin variation — human not filtered. Wavy dark brown hair voluminous loosely falling past shoulders. Single eyelid, deep brown eyes, heavy-lidded intense gaze. Full lips, defined jaw, elegant neck. Wearing a white satin micro-bandeau — strapless minimal construction, straight-cut neckline, structured inner boning, narrow band. Matching white satin micro-brief — minimal coverage, high-cut silhouette, narrow side ties. Body angled 20° from camera, right hand resting lightly at hip, left arm at side, chin tilted slightly down, direct intense gaze beneath lowered lashes. Candlelight warmth raking bare skin and white satin, deep blacks, strong editorial intimacy. Shot on Hasselblad X2D, 85mm f/1.8, ISO 800. Photorealism. No text, no watermark.`;

const log = { stamp: STAMP, base: BASE, model: MODEL, size: SIZE, quality: QUALITY, attempts: [] };

async function tryNonStream() {
  console.log(`[gen non-stream] ${BASE}/v1/images/generations`);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, size: SIZE, quality: QUALITY, n: 1, moderation: 'low' }),
    });
    const txt = await res.text();
    const elapsed = Date.now() - t0;
    const ct = res.headers.get('content-type') ?? '';
    console.log(`[non-stream] HTTP ${res.status} ${ct} ${elapsed}ms`);
    log.attempts.push({ mode: 'non-stream', http: res.status, ct, elapsed, head: txt.slice(0, 400) });
    return { ok: res.ok, status: res.status, txt };
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.log(`[non-stream] EXC ${elapsed}ms ${e.code ?? ''} ${e.message}`);
    log.attempts.push({ mode: 'non-stream', error: e.message, code: e.code, elapsed });
    return { ok: false, status: 0, txt: e.message };
  }
}

async function tryStream() {
  console.log(`[gen stream] ${BASE}/v1/images/generations  stream=true partial_images=2`);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, size: SIZE, quality: QUALITY, n: 1, moderation: 'low', stream: true, partial_images: 2 }),
    });
    console.log(`[stream] HTTP ${res.status} ${res.headers.get('content-type')} (waiting for SSE...)`);
    if (!res.ok) {
      const errTxt = await res.text();
      const elapsed = Date.now() - t0;
      log.attempts.push({ mode: 'stream', http: res.status, elapsed, head: errTxt.slice(0, 400) });
      return { ok: false, status: res.status, txt: errTxt };
    }
    let lastFinal = null;
    let lastPartial = null;
    let partialCount = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const dataLine = chunk.split('\n').find(l => l.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          if (j.type === 'image_generation.partial_image' || j.b64_json && !j.size) { partialCount++; lastPartial = j; }
          if (j.type === 'image_generation.completed' || (j.b64_json && j.size)) lastFinal = j;
          if (j.type) console.log(`[sse] type=${j.type}`);
        } catch {}
      }
    }
    const elapsed = Date.now() - t0;
    log.attempts.push({ mode: 'stream', http: 200, elapsed, partials: partialCount, gotFinal: !!lastFinal });
    console.log(`[stream] done ${elapsed}ms partials=${partialCount} final=${!!lastFinal}`);
    const final = lastFinal ?? lastPartial;
    if (final?.b64_json) return { ok: true, status: 200, b64: final.b64_json };
    if (final?.url) return { ok: true, status: 200, url: final.url };
    return { ok: false, status: 200, txt: 'stream ended with no image' };
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.log(`[stream] EXC ${elapsed}ms ${e.code ?? ''} ${e.message}`);
    log.attempts.push({ mode: 'stream', error: e.message, code: e.code, elapsed });
    return { ok: false, status: 0, txt: e.message };
  }
}

async function saveResult(r) {
  if (r.b64) {
    const buf = Buffer.from(r.b64, 'base64');
    const file = join(OUT, `uocode-vietnam-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`[saved b64] → ${file} (${buf.length} bytes)`);
    log.saved = file; return;
  }
  if (r.url) {
    const dl = await fetch(r.url);
    if (dl.ok) {
      const buf = Buffer.from(await dl.arrayBuffer());
      const file = join(OUT, `uocode-vietnam-${STAMP}.png`);
      writeFileSync(file, buf);
      console.log(`[saved url] → ${file} (${buf.length} bytes)`);
      log.saved = file; log.url = r.url;
    }
    return;
  }
  // parse json from txt
  try {
    const j = JSON.parse(r.txt);
    const item = j?.data?.[0];
    if (item?.b64_json) return saveResult({ b64: item.b64_json });
    if (item?.url) { log.revised_prompt = item.revised_prompt; return saveResult({ url: item.url }); }
  } catch {}
}

let result = await tryNonStream();
if (!result.ok || (result.status >= 500 || result.status === 524)) {
  console.log(`[fallback] non-stream failed (${result.status}). Retry with streaming...`);
  result = await tryStream();
}

if (result.ok) await saveResult(result);
else console.log(`[final fail] ${String(result.txt).slice(0, 600)}`);

writeFileSync(join(OUT, `uocode-vietnam-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`[done] log → testoutput/uocode-vietnam-${STAMP}.json`);
