// Minimal GrsAI connectivity test — safe prompt, non-streaming.
// Run: node testoutput/test-grsai.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Parse .env.local without adding dotenv dep
const env = {};
try {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error('Cannot read .env.local:', e.message);
  process.exit(1);
}

const API_KEY = env.GRSAI_API_KEY || process.env.GRSAI_API_KEY;
const BASE = (env.GRSAI_BASE_URL || process.env.GRSAI_BASE_URL || 'https://grsaiapi.com').replace(/\/$/, '');
if (!API_KEY) { console.error('GRSAI_API_KEY missing'); process.exit(1); }

const prompt = 'A ripe red apple on a wooden table, soft window light, product photography, 85mm, shallow depth of field. Photorealism.';
const body = {
  model: 'gpt-image-2',
  prompt,
  size: '1024x1024',
  quality: 'high',
  n: 1,
  moderation: 'low',
  output_format: 'png',
};

const started = Date.now();
console.log(`[test] POST ${BASE}/v1/images/generations model=${body.model} size=${body.size}`);

let res;
try {
  res = await fetch(`${BASE}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
} catch (e) {
  console.error('[test] network error:', e.message);
  process.exit(2);
}

const elapsed = Date.now() - started;
const text = await res.text();
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const meta = {
  timestamp: ts,
  base: BASE,
  status: res.status,
  ok: res.ok,
  elapsed_ms: elapsed,
  request: body,
  headers: Object.fromEntries(res.headers),
};

if (!res.ok) {
  meta.error_body = text.slice(0, 4000);
  writeFileSync(join(__dirname, `test-grsai-${ts}.json`), JSON.stringify(meta, null, 2));
  console.error(`[test] FAIL ${res.status} (${elapsed}ms)`);
  console.error(text.slice(0, 500));
  process.exit(3);
}

let json;
try { json = JSON.parse(text); } catch { json = null; }
if (!json) {
  meta.error_body = 'non-JSON response: ' + text.slice(0, 2000);
  writeFileSync(join(__dirname, `test-grsai-${ts}.json`), JSON.stringify(meta, null, 2));
  console.error('[test] FAIL non-JSON'); process.exit(4);
}

const b64 = json?.data?.[0]?.b64_json;
const url = json?.data?.[0]?.url;
if (!b64 && !url) {
  meta.response_keys = Object.keys(json);
  meta.response_sample = JSON.stringify(json).slice(0, 2000);
  writeFileSync(join(__dirname, `test-grsai-${ts}.json`), JSON.stringify(meta, null, 2));
  console.error('[test] FAIL no image in payload'); process.exit(5);
}

let pngBuf;
if (b64) {
  pngBuf = Buffer.from(b64, 'base64');
} else {
  const imgRes = await fetch(url);
  pngBuf = Buffer.from(await imgRes.arrayBuffer());
  meta.image_url = url;
}

const pngName = `test-grsai-${ts}.png`;
writeFileSync(join(__dirname, pngName), pngBuf);
meta.output_file = pngName;
meta.output_bytes = pngBuf.length;
writeFileSync(join(__dirname, `test-grsai-${ts}.json`), JSON.stringify(meta, null, 2));
console.log(`[test] OK status=${res.status} elapsed=${elapsed}ms bytes=${pngBuf.length} file=${pngName}`);
