#!/usr/bin/env node
/**
 * Read GrsAI response as one JSON blob (not SSE). Shows the actual payload shape.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const BASE = env.GRSAI_BASE_URL || 'https://grsaiapi.com';
const KEY = env.GRSAI_API_KEY;

const t0 = Date.now();
const res = await fetch(`${BASE}/v1/images/generations`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: 'A red apple on wooden table, studio lighting',
    stream: true,
    partial_images: 3,
    moderation: 'low',
    size: '1024x1024',
    quality: 'low',
  }),
});
console.log(`HTTP ${res.status} ct=${res.headers.get('content-type')} t=${Date.now() - t0}ms`);
const text = await res.text();
console.log(`body len=${text.length}`);

try {
  const j = JSON.parse(text);
  console.log('top keys:', Object.keys(j));
  console.log('stringified preview:', JSON.stringify(j).replace(/"b64_json":"[^"]{40,}"/g, '"b64_json":"<B64>"').slice(0, 2000));
} catch (e) {
  console.log('not JSON — first 500 chars:');
  console.log(text.slice(0, 500));
}
