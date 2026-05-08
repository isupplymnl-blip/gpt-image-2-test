#!/usr/bin/env node
/**
 * Test 10: Raw dump of GrsAI stream mode.
 * /v1/api/generate with replyType:"stream" — inspect SSE shape.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const BASE = env.GRSAI_BASE_URL || 'https://grsaiapi.com';
const KEY = env.GRSAI_API_KEY;

const PROMPT = process.env.PROMPT ?? 'Hyper realistic portrait of a blood-covered injured fighter lying in alley after violent combat';

const t0 = Date.now();
const res = await fetch(`${BASE}/v1/api/generate`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: PROMPT,
    aspectRatio: '1024x1024',
    replyType: 'stream',
  }),
});
console.log(`HTTP ${res.status} ct=${res.headers.get('content-type')}`);

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let n = 0;
const shapes = new Map();
const urls = [];

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    n++;
    const short = line.length > 400 ? line.slice(0, 400) + `…<${line.length}b>` : line;
    const clean = short.replace(/([A-Za-z0-9+/]{100}[A-Za-z0-9+/=]*)/g, '<B64:len=$1>').slice(0, 500);
    console.log(`[${n}] ${clean}`);

    if (line.startsWith('data:')) {
      const raw = line.slice(5).trim();
      if (raw === '[DONE]') continue;
      try {
        const p = JSON.parse(raw);
        const sig = Object.keys(p).sort().join(',');
        shapes.set(sig, (shapes.get(sig) ?? 0) + 1);
        if (Array.isArray(p.results)) {
          for (const r of p.results) if (r.url) urls.push(r.url);
        }
        if (p.url) urls.push(p.url);
      } catch { /* not json */ }
    }
  }
}

console.log(`\ntotal lines=${n} elapsed=${Date.now()-t0}ms`);
console.log('shapes:');
for (const [sig, n] of shapes) console.log(`  ${n}x { ${sig} }`);
console.log('URLs captured:', urls);
