import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const env = {};
const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const API_KEY = env.GRSAI_API_KEY;
const BASE = (env.GRSAI_BASE_URL || 'https://grsaiapi.com').replace(/\/$/, '');
if (!API_KEY) { console.error('GRSAI_API_KEY missing'); process.exit(1); }

const slides = JSON.parse(readFileSync(join(__dirname, 'miyuri-rebuilt-slides.json'), 'utf8'));
const size = '1024x1280';
const results = [];

for (const s of slides) {
  const body = { model: 'gpt-image-2', prompt: s.prompt, size, quality: 'high', n: 1, moderation: 'low', output_format: 'png' };
  const started = Date.now();
  console.log(`[${s.name}] POST ...`);
  let res, text;
  try {
    res = await fetch(`${BASE}/v1/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (e) {
    console.error(`[${s.name}] network error: ${e.message}`);
    results.push({ slide: s.name, ok: false, error: 'network: ' + e.message });
    continue;
  }
  const elapsed = Date.now() - started;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (!res.ok) {
    console.error(`[${s.name}] FAIL ${res.status} (${elapsed}ms): ${text.slice(0, 240)}`);
    writeFileSync(join(__dirname, `${s.name}-${ts}.error.json`), JSON.stringify({ status: res.status, body: text.slice(0, 4000) }, null, 2));
    results.push({ slide: s.name, ok: false, status: res.status, elapsed_ms: elapsed, error_excerpt: text.slice(0, 300) });
    continue;
  }
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  const b64 = json?.data?.[0]?.b64_json;
  const url = json?.data?.[0]?.url;
  if (!b64 && !url) {
    console.error(`[${s.name}] FAIL no image in payload`);
    results.push({ slide: s.name, ok: false, error: 'no image' });
    continue;
  }
  let pngBuf;
  if (b64) pngBuf = Buffer.from(b64, 'base64');
  else { const r = await fetch(url); pngBuf = Buffer.from(await r.arrayBuffer()); }
  const pngName = `${s.name}-${ts}.png`;
  writeFileSync(join(__dirname, pngName), pngBuf);
  console.log(`[${s.name}] OK ${elapsed}ms ${pngBuf.length}B file=${pngName}`);
  results.push({ slide: s.name, ok: true, status: 200, elapsed_ms: elapsed, bytes: pngBuf.length, file: pngName });
}

writeFileSync(join(__dirname, 'miyuri-rebuilt-summary.json'), JSON.stringify({ when: new Date().toISOString(), base: BASE, size, results }, null, 2));
const okCount = results.filter(r => r.ok).length;
console.log(`\n[summary] ${okCount}/${results.length} succeeded`);
