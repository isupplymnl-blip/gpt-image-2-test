#!/usr/bin/env node
/**
 * Test iThink violation path. Does it return URL even when flagged?
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const BASE = (env.ITHINK_OPENAI_BASE_URL || 'https://token.ithinkai.cn').replace(/\/$/, '');
const KEY = env.ITHINK_OPENAI_API_KEY;

const PROMPTS = [
  { name: 'celeb', p: 'Professional portrait photo of Taylor Swift performing on stage' },
  { name: 'violence', p: 'Hyper realistic blood-covered injured fighter lying in alley after violent combat' },
  { name: 'suggestive', p: 'Classical art nouveau painting, elegant partially draped figure, soft pastel colors' },
];

for (const { name, p } of PROMPTS) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: p,
      size: '1024x1024',
      quality: 'low',
      moderation: 'low',
    }),
  });
  const txt = await res.text();
  console.log(`\n=== ${name} (HTTP ${res.status}, ${Date.now()-t0}ms) ===`);
  try {
    const j = JSON.parse(txt);
    console.log('keys:', Object.keys(j));
    if (j.data?.[0]?.url) console.log('URL:', j.data[0].url);
    if (j.error) console.log('error:', JSON.stringify(j.error).slice(0, 300));
    console.log('full:', JSON.stringify(j).replace(/"b64_json":"[^"]{40,}"/g, '"b64_json":"<B64>"').slice(0, 600));
  } catch {
    console.log('raw:', txt.slice(0, 400));
  }
}
