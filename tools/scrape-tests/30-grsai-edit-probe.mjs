#!/usr/bin/env node
/**
 * Probe GrsAI for the correct edit endpoint path.
 * Tries common OpenAI-compatible variants and reports status + first 200 bytes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ headersTimeout: 60_000, bodyTimeout: 60_000 }));
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
const KEY = env.GRSAI_API_KEY;
const BASE = (env.GRSAI_BASE_URL || 'https://grsaiapi.com').replace(/\/$/, '');

const paths = [
  '/v1/images/edits',
  '/v1/images/edit',
  '/v1/api/edit',
  '/v1/api/edits',
  '/v1/api/generate',
  '/api/v1/images/edits',
  '/images/edits',
];
const png = readFileSync(join(ROOT, 'testoutput/uocode-japan-2026-05-08T08-32-40-348Z.png'));

for (const p of paths) {
  const fd = new FormData();
  fd.append('model', 'gpt-image-2');
  fd.append('prompt', 'change background to marble bathroom');
  fd.append('size', '1024x1024');
  fd.append('image', new Blob([png], { type: 'image/png' }), 'input.png');
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + p, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: fd,
    });
    const ct = r.headers.get('content-type') || '';
    const text = await r.text();
    console.log(`${p.padEnd(28)} → ${r.status} ${Date.now() - t0}ms ct=${ct.slice(0, 40)} body=${text.slice(0, 200).replace(/\n/g, ' ')}`);
  } catch (e) {
    console.log(`${p.padEnd(28)} → ERR ${e.message}`);
  }
}
