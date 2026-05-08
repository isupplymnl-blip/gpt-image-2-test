#!/usr/bin/env node
/**
 * Test 4: GrsAI benign — validates scraper against GrsAI proxy.
 * GrsAI is OpenAI-compatible; same SSE format, different host.
 */
const HOST = process.env.HOST ?? 'http://localhost:3005';

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/scrape-pre-moderation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'grsai',
      prompt: 'A serene mountain lake at golden hour, photorealistic, wide shot',
      partialImages: 3,
      keepAllFrames: true,
      settings: { model: 'gpt-image-2', quality: 'low', size: 'auto', output_format: 'png' },
    }),
  });
  const elapsed = Date.now() - t0;
  const json = await res.json();
  console.log(`[test4 grsai] HTTP ${res.status} in ${elapsed}ms`);
  console.log(JSON.stringify({
    ok: json.ok,
    provider: json.provider,
    blocked: json.blocked,
    frameCount: json.frameCount,
    framesPersisted: json.frames?.length,
    finalImageUrl: json.finalImageUrl,
    preModerationImageUrl: json.preModerationImageUrl,
    blockReason: json.blockReason?.slice(0, 200),
    endpoint: json.endpoint,
  }, null, 2));

  const pass = json.ok && json.frameCount >= 1;
  console.log(pass ? '\n[PASS] frames captured from GrsAI' : '\n[FAIL] no frames');
  process.exit(pass ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
