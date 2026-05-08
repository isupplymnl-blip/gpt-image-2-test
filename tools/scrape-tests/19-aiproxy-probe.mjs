#!/usr/bin/env node
/**
 * Option 1: Probe upstream aiproxy.vip directly.
 * iThink's success URLs point to webstatic.aiproxy.vip — which means
 * aiproxy.vip is the real LLM host. Try hitting it directly with the iThink
 * key (may work if they share OAuth/bearer tokens) and with alternate
 * base URLs we can guess.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const KEY = env.ITHINK_OPENAI_API_KEY;
if (!KEY) { console.error('missing ITHINK_OPENAI_API_KEY'); process.exit(1); }

// Candidate upstream bases derived from the CDN URL pattern
const CANDIDATES = [
  'https://api.aiproxy.vip',
  'https://api.aiproxy.io',
  'https://aiproxy.vip',
  'https://webstatic.aiproxy.vip',
  'https://gpt-image-2.aiproxy.vip',
  'https://chatgptproxy.aiproxy.vip',
];

const PROMPT = 'A serene mountain lake at golden hour, photorealistic, wide shot';

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const log = [];

for (const base of CANDIDATES) {
  const rec = { base, tries: [] };
  // Try common OpenAI-compatible paths
  for (const path of ['/v1/images/generations', '/v1/chat/completions', '/v1/models']) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}${path}`, {
        method: path.includes('models') ? 'GET' : 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: path.includes('models') ? undefined : JSON.stringify(
          path.includes('images')
            ? { model: 'gpt-image-2', prompt: PROMPT, size: '1024x1024', quality: 'low' }
            : { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }
        ),
      });
      const ct = res.headers.get('content-type') ?? '';
      const txt = await res.text();
      const elapsed = Date.now() - t0;
      const snippet = txt.slice(0, 200);
      let interesting = false;
      if (res.ok) interesting = true;
      else if (res.status === 401 || res.status === 403) interesting = true; // reachable but need auth
      rec.tries.push({ path, http: res.status, ct, elapsed, snippet, interesting });
      console.log(`${interesting ? '★' : ' '} ${base}${path} → HTTP ${res.status} ${ct.slice(0,30)} ${elapsed}ms ${snippet.slice(0, 80)}`);
    } catch (e) {
      rec.tries.push({ path, error: e.message });
      console.log(`  ${base}${path} → ERR ${e.message}`);
    }
  }
  log.push(rec);
}

writeFileSync(join(OUT, `aiproxy-probe-${STAMP}.json`), JSON.stringify(log, null, 2));
console.log(`\n★ = reachable (200/401/403). See testoutput/aiproxy-probe-${STAMP}.json`);
