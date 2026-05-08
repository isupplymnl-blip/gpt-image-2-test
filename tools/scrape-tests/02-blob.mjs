#!/usr/bin/env node
/**
 * Test 2: Blob mode — pipe raw bytes straight to disk.
 * Validates the `?format=blob` MITM proxy path.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOST = process.env.HOST ?? 'http://localhost:3005';
const OUT = join(process.cwd(), 'test-output', 'scrape-blob.png');

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/scrape-pre-moderation?format=blob`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'A single red apple on a wooden table, studio lighting',
      partialImages: 3,
      settings: { quality: 'low', output_format: 'png' },
    }),
  });
  const elapsed = Date.now() - t0;

  console.log(`[test2] HTTP ${res.status} in ${elapsed}ms`);
  console.log('  X-Scrape-Blocked:', res.headers.get('x-scrape-blocked'));
  console.log('  X-Scrape-Source:', res.headers.get('x-scrape-source'));
  console.log('  X-Scrape-Frame-Count:', res.headers.get('x-scrape-frame-count'));
  console.log('  Content-Type:', res.headers.get('content-type'));

  if (!res.ok) {
    const txt = await res.text();
    console.log('body:', txt.slice(0, 500));
    process.exit(1);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(OUT, buf);
  console.log(`\n[PASS] wrote ${buf.length} bytes → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
