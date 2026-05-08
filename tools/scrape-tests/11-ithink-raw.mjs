#!/usr/bin/env node
/**
 * Raw SSE probe against iThink — does it honor stream:true + partial_images?
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const BASE = (env.ITHINK_OPENAI_BASE_URL || 'https://token.ithinkai.cn').replace(/\/$/, '');
const KEY = env.ITHINK_OPENAI_API_KEY;

const PROMPT = process.env.PROMPT ?? 'Epic fantasy battle scene with detailed armor, dragons in sky, intricate lighting';

if (!KEY) { console.error('missing ITHINK_OPENAI_API_KEY'); process.exit(1); }

const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/generations`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: PROMPT,
    stream: true,
    partial_images: 3,
    size: '1024x1024',
    quality: 'high',
    moderation: 'low',
  }),
});

console.log(`HTTP ${res.status} ct=${res.headers.get('content-type')} t=${Date.now()-t0}ms`);

const ct = res.headers.get('content-type') ?? '';
if (!ct.includes('text/event-stream')) {
  const txt = await res.text();
  console.log(`NOT SSE — body len=${txt.length}`);
  try {
    const j = JSON.parse(txt);
    console.log('top keys:', Object.keys(j));
    console.log('preview:', JSON.stringify(j).replace(/"b64_json":"[^"]{40,}"/g, '"b64_json":"<B64>"').slice(0, 2000));
  } catch {
    console.log('first 500:', txt.slice(0, 500));
  }
  process.exit(0);
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let n = 0;
const shapes = new Map();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    n++;
    const clean = (line.length > 300 ? line.slice(0, 300) + `…<${line.length}b>` : line)
      .replace(/([A-Za-z0-9+/]{100}[A-Za-z0-9+/=]*)/g, '<B64:$1.len>')
      .slice(0, 400);
    console.log(`[${n}] ${clean}`);
    if (line.startsWith('data:')) {
      const raw = line.slice(5).trim();
      if (raw === '[DONE]') continue;
      try {
        const p = JSON.parse(raw);
        const sig = Object.keys(p).sort().join(',');
        shapes.set(sig, (shapes.get(sig) ?? 0) + 1);
        if (p.type) console.log(`   type=${p.type} pidx=${p.partial_image_index ?? '-'} seq=${p.sequence_number ?? '-'}`);
      } catch { /* */ }
    }
  }
}
console.log(`\ntotal=${n} elapsed=${Date.now()-t0}ms`);
for (const [sig, c] of shapes) console.log(`  ${c}x { ${sig} }`);
