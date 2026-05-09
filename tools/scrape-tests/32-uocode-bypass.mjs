#!/usr/bin/env node
/**
 * Test 32: Uocode rate-limit bypass probe.
 * Account is $0 — every request will 403 (quota). The interesting signal is
 * WHEN we start receiving 429 (rate-limit) vs continuing to 403. If 429 stays
 * at slot 6+ regardless of axis, the limit is global. If a particular axis
 * keeps returning 403 past 5 hits, that axis bypasses the rate limiter.
 *
 * Probes (one per minute window, 65s cooldown between):
 *   A. baseline  — 10 plain /images/generations as fast as possible
 *   B. split     — 5× /images/generations + 5× /images/edits interleaved
 *   C. headers   — rotate X-Forwarded-For / X-Real-IP / CF-Connecting-IP per req
 *   F. spaced    — one req every 13s for 80s (control: confirms window resets)
 *
 * Output: testoutput/uocode-bypass-{probe}-{stamp}.json with per-request log.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';
import { join } from 'node:path';
setGlobalDispatcher(new Agent({ headersTimeout: 90_000, bodyTimeout: 90_000 }));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const KEY = env.UOCODE_API_KEY;
const BASE = (env.UOCODE_BASE_URL || 'https://www.uocode.com/v1').replace(/\/$/, '');
if (!KEY) { console.error('UOCODE_API_KEY missing'); process.exit(1); }

const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const PROMPT = 'Vogue Korea luxury editorial. Commercial nightwear campaign photography for Miyuri brand. Dimly lit interior, dark velvet wall paneling, single warm candlelight source from camera-right at 25°, 2700K, candlelight rakes across fabric creating translucent warm glow, deep shadow zones camera-left, no flash. Medium close-up shot, 85mm equivalent, f/1.8 very shallow depth of field. Korean woman, 20 years old, porcelain skin with cool pink undertone, Fitzpatrick I, fine pores barely visible, candlelight creates luminous warm gradient across forehead and cheekbones, cinematic shadow falloff on skin — not smooth, not plastic. Wavy black hair, loosely pinned with face-framing strands falling forward. Single eyelid, dark eyes with soft serene expression. Small defined lips, high cheekbones. Ivory silk negligee — deep V-neckline with delicate lace trim, bias-cut body, thin spaghetti straps, mid-thigh hem, fabric semi-transparent where candlelight passes through. No visible undergarment. Contrapposto stance, weight on right hip, left arm loosely at side, eyes half-closed in serene contentment. Ivory and candlelight palette, deep blacks, atmospheric intimacy. Photorealism. No text, no watermarks, no extra objects.';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randIp = () => `${1 + ((Math.random() * 254) | 0)}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}`;
const interestingHeaders = [
  'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining',
  'x-ratelimit-reset', 'x-request-id', 'cf-ray', 'content-type',
];

async function maybeSaveImage(text, kind, idx) {
  try {
    const j = JSON.parse(text);
    const item = j?.data?.[0];
    if (!item) return null;
    let buf;
    if (item.b64_json) {
      buf = Buffer.from(item.b64_json, 'base64');
    } else if (item.url) {
      const dl = await fetch(item.url);
      if (!dl.ok) return null;
      buf = Buffer.from(await dl.arrayBuffer());
    } else return null;
    const file = join(OUT, `uocode-bypass-${kind}-${idx}-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`    [saved] ${file} (${buf.length} bytes)`);
    return file;
  } catch { return null; }
}

async function callGen(extraHeaders = {}, idx = 0) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: PROMPT, size: '1024x1024', quality: 'low', n: 1 }),
    });
    const text = await r.text();
    const headers = {};
    for (const h of interestingHeaders) { const v = r.headers.get(h); if (v) headers[h] = v; }
    let saved = null;
    if (r.status >= 200 && r.status < 300) saved = await maybeSaveImage(text, 'gen', idx);
    return { kind: 'gen', t: Date.now() - t0, status: r.status, headers, body: text.slice(0, 250), saved };
  } catch (e) {
    return { kind: 'gen', t: Date.now() - t0, status: 0, error: e.message };
  }
}

async function callEdits(extraHeaders = {}, idx = 0) {
  const t0 = Date.now();
  try {
    const fd = new FormData();
    fd.append('model', 'gpt-image-2');
    fd.append('prompt', PROMPT);
    fd.append('size', '1024x1024');
    fd.append('quality', 'low');
    fd.append('n', '1');
    fd.append('image', new Blob([TINY_PNG], { type: 'image/png' }), 'tiny.png');
    const r = await fetch(`${BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, ...extraHeaders },
      body: fd,
    });
    const text = await r.text();
    const headers = {};
    for (const h of interestingHeaders) { const v = r.headers.get(h); if (v) headers[h] = v; }
    let saved = null;
    if (r.status >= 200 && r.status < 300) saved = await maybeSaveImage(text, 'edit', idx);
    return { kind: 'edit', t: Date.now() - t0, status: r.status, headers, body: text.slice(0, 250), saved };
  } catch (e) {
    return { kind: 'edit', t: Date.now() - t0, status: 0, error: e.message };
  }
}

function summarize(name, results) {
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const first429 = results.findIndex((r) => r.status === 429);
  const ok = results.filter((r) => r.status >= 200 && r.status < 400).length;
  const non429 = results.filter((r) => r.status !== 429).length;
  console.log(`[${name}] counts:`, counts, `non429=${non429}/${results.length} first429@idx=${first429}`);
  return { name, counts, first429, ok, non429, total: results.length };
}

async function probeA() {
  console.log('\n=== A. baseline — 10 plain gen requests, parallel ===');
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => callGen({}, `A${i + 1}`)));
  return { results, summary: summarize('A', results) };
}

async function probeB() {
  console.log('\n=== B. endpoint split — 5 gen + 5 edits, interleaved ===');
  const tasks = [];
  for (let i = 0; i < 5; i++) {
    tasks.push(callGen({}, `B-gen${i + 1}`));
    tasks.push(callEdits({}, `B-edit${i + 1}`));
  }
  const results = await Promise.all(tasks);
  return { results, summary: summarize('B', results) };
}

async function probeC() {
  console.log('\n=== C. header injection — rotated X-Forwarded-For per req ===');
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => {
      const ip = randIp();
      return callGen({
        'X-Forwarded-For': ip,
        'X-Real-IP': ip,
        'CF-Connecting-IP': ip,
        'X-Client-IP': ip,
      }, `C${i + 1}`);
    }),
  );
  return { results, summary: summarize('C', results) };
}

async function probeF() {
  console.log('\n=== F. spacing — 8 reqs every 13s (~104s window, sequential) ===');
  const results = [];
  for (let i = 0; i < 8; i++) {
    const r = await callGen({}, `F${i + 1}`);
    console.log(`  F#${i + 1}: ${r.status} t=${r.t}ms`);
    results.push(r);
    if (i < 7) await sleep(13_000);
  }
  return { results, summary: summarize('F', results) };
}

const probes = { A: probeA, B: probeB, C: probeC, F: probeF };
const argv = process.argv.slice(2);
const which = argv.length ? argv : ['A', 'B', 'C', 'F'];

const all = {};
for (const name of which) {
  if (!probes[name]) { console.warn(`unknown probe ${name}, skipping`); continue; }
  const out = await probes[name]();
  all[name] = out;
  writeFileSync(join(OUT, `uocode-bypass-${name}-${STAMP}.json`), JSON.stringify(out, null, 2));
  // 65s cooldown to let the 5/min window roll over (skip after last)
  if (name !== which[which.length - 1]) {
    console.log('  cooldown 65s …');
    await sleep(65_000);
  }
}

writeFileSync(join(OUT, `uocode-bypass-summary-${STAMP}.json`), JSON.stringify(
  { stamp: STAMP, base: BASE, probes: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.summary])) },
  null, 2,
));
console.log('\n=== summary ===');
for (const [k, v] of Object.entries(all)) console.log(k, JSON.stringify(v.summary));
