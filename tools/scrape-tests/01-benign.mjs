#!/usr/bin/env node
/**
 * Test 1: Benign prompt → expect clean final image + 3 partial frames.
 * Validates the scrape pipeline itself without involving moderation.
 */
const HOST = process.env.HOST ?? 'http://localhost:3005';

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/scrape-pre-moderation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'A serene mountain lake at golden hour, photorealistic, wide shot',
      partialImages: 3,
      keepAllFrames: true,
      settings: { quality: 'low', size: 'auto', output_format: 'png' },
    }),
  });
  const elapsed = Date.now() - t0;
  const json = await res.json();
  console.log(`[test1] HTTP ${res.status} in ${elapsed}ms`);
  console.log(JSON.stringify({
    ok: json.ok,
    blocked: json.blocked,
    frameCount: json.frameCount,
    framesPersisted: json.frames?.length,
    finalImageUrl: json.finalImageUrl,
    preModerationImageUrl: json.preModerationImageUrl,
    revisedPrompt: json.revisedPrompt?.slice(0, 80),
    blockReason: json.blockReason,
  }, null, 2));

  const pass = json.ok && !json.blocked && json.frameCount >= 1 && json.finalImageUrl;
  console.log(pass ? '\n[PASS] benign prompt cleared, frames captured' : '\n[FAIL] unexpected result');
  process.exit(pass ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
