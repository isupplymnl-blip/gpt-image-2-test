#!/usr/bin/env node
/**
 * Same as 05-raw-sse but quality:high — longer gen → more partial frames emitted.
 * Also adds `event:` line parsing since OpenAI uses named events.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const KEY = env.OPENAI_API_KEY;
const PROMPT = process.env.PROMPT ?? 'Epic fantasy battle scene with detailed armor, dragons in sky, intricate lighting, highly detailed';
const QUALITY = process.env.QUALITY ?? 'high';

const t0 = Date.now();
const res = await fetch(`https://api.openai.com/v1/images/generations`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: PROMPT,
    stream: true,
    partial_images: 3,
    moderation: 'low',
    size: '1024x1024',
    quality: QUALITY,
  }),
});
console.log(`HTTP ${res.status} ct=${res.headers.get('content-type')}`);

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let currentEvent = null;
let n = 0;
const eventCounts = {};

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) { currentEvent = null; continue; }
    n++;
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
      eventCounts[currentEvent] = (eventCounts[currentEvent] ?? 0) + 1;
      console.log(`[${n}] event=${currentEvent}`);
    } else if (line.startsWith('data: ')) {
      const raw = line.slice(6).trim();
      try {
        const p = JSON.parse(raw);
        const keys = Object.keys(p).sort().join(',');
        const preview = JSON.stringify(p).replace(/"b64_json":"[^"]+"/g, '"b64_json":"<B64>"').slice(0, 250);
        console.log(`[${n}] data event=${currentEvent} type=${p.type} seq=${p.sequence_number ?? '-'} keys=${keys}`);
        console.log(`     ${preview}`);
      } catch (e) {
        console.log(`[${n}] data parse fail`);
      }
    } else {
      console.log(`[${n}] ${line.slice(0, 120)}`);
    }
  }
}
console.log(`\nevent counts:`, eventCounts, `elapsed=${Date.now()-t0}ms`);
