#!/usr/bin/env node
/**
 * Raw SSE dump — hits GrsAI (or OpenAI) directly and prints every line that
 * comes back. Bypasses our scraper so we can see the actual SSE frame shape.
 *
 * Env:
 *   PROVIDER=grsai|openai  (default grsai)
 *   MODEL=gpt-image-2
 *   PROMPT="..."
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';

// Load .env.local manually — no dotenv dep
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const PROVIDER = process.env.PROVIDER ?? 'grsai';
const MODEL = process.env.MODEL ?? 'gpt-image-2';
const PROMPT = process.env.PROMPT ?? 'A red apple on wooden table, studio lighting';

const isGrsai = PROVIDER === 'grsai';
const BASE = isGrsai ? (env.GRSAI_BASE_URL || 'https://grsaiapi.com') : 'https://api.openai.com';
const KEY = isGrsai ? env.GRSAI_API_KEY : env.OPENAI_API_KEY;

if (!KEY) { console.error(`Missing ${isGrsai ? 'GRSAI_API_KEY' : 'OPENAI_API_KEY'}`); process.exit(1); }

console.log(`[raw-sse] provider=${PROVIDER} base=${BASE} model=${MODEL}`);

const body = {
  model: MODEL,
  prompt: PROMPT,
  stream: true,
  partial_images: 3,
  moderation: 'low',
  size: '1024x1024',
  quality: 'low',
};

const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/generations`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
  body: JSON.stringify(body),
});

console.log(`[raw-sse] HTTP ${res.status} ${res.statusText}`);
console.log(`[raw-sse] content-type: ${res.headers.get('content-type')}`);

if (!res.ok) {
  console.log('BODY:', await res.text());
  process.exit(1);
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let lineCount = 0;
let dataLineCount = 0;
const shapes = new Map();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    lineCount++;
    // Print prefix + short view
    const isData = line.startsWith('data:');
    if (isData) dataLineCount++;
    const short = line.length > 300 ? line.slice(0, 300) + `…<${line.length}b>` : line;
    console.log(`[${lineCount}] ${short.replace(/([A-Za-z0-9+/]{80}[A-Za-z0-9+/=]*)/g, '<B64:$1>').slice(0, 400)}`);

    if (isData) {
      const raw = line.slice(5).trim();
      if (raw === '[DONE]') continue;
      try {
        const p = JSON.parse(raw);
        const keySig = Object.keys(p).sort().join(',');
        shapes.set(keySig, (shapes.get(keySig) ?? 0) + 1);
        // Show nested shape for data[]
        if (Array.isArray(p.data) && p.data[0]) {
          const innerKeys = Object.keys(p.data[0]).sort().join(',');
          console.log(`  └─ data[0] keys: ${innerKeys}`);
        }
        if (Array.isArray(p.partial_images) && p.partial_images[0]) {
          const innerKeys = Object.keys(p.partial_images[0]).sort().join(',');
          console.log(`  └─ partial_images[0] keys: ${innerKeys}`);
        }
      } catch (e) {
        console.log(`  └─ JSON parse fail: ${e.message}`);
      }
    }
  }
}

console.log(`\n[raw-sse] done in ${Date.now() - t0}ms`);
console.log(`[raw-sse] total lines=${lineCount} data-lines=${dataLineCount}`);
console.log(`[raw-sse] frame shapes seen:`);
for (const [sig, n] of shapes) console.log(`  ${n}x { ${sig} }`);
