#!/usr/bin/env node
/**
 * Test 3: Cascade — run full tactic matrix on a prompt likely to hit moderation.
 * Validates that the cascade keeps running across tactics and preserves
 * pre-moderation frames even when finals are blocked.
 *
 * NOTE: prompt is mild — just enough to exercise the edits-endpoint and
 * n=4 tactics without actually triggering hard blocks. Swap PROMPT if you
 * want to see the cascade full-exercise.
 */
const HOST = process.env.HOST ?? 'http://localhost:3005';

const PROMPT = process.env.PROMPT
  ?? 'A cinematic still of a boxer bleeding after a rough fight, dramatic studio lighting, moody';

async function main() {
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/scrape-cascade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: PROMPT,
      partialImages: 3,
      maxAttempts: 4,
      stopOnSuccess: true,
      sanitizePrompt: true,
      settings: { quality: 'low', output_format: 'png' },
    }),
  });
  const elapsed = Date.now() - t0;

  const json = await res.json();
  console.log(`[test3] HTTP ${res.status} in ${elapsed}ms`);
  console.log(JSON.stringify({
    cleared: json.cleared,
    winningAttempt: json.winningAttempt,
    finalImageUrl: json.finalImageUrl,
    preModerationImageUrl: json.preModerationImageUrl,
    preModerationSource: json.preModerationSource,
    attemptSummary: json.attempts?.map(a => ({
      label: a.label,
      endpoint: a.endpoint,
      httpStatus: a.httpStatus,
      blocked: a.blocked,
      frameCount: a.frameCount,
      hasFinal: !!a.finalImageUrl,
      blockReason: a.blockReason?.slice(0, 100),
    })),
  }, null, 2));

  const hasAnyOutput = json.finalImageUrl || json.preModerationImageUrl;
  console.log(hasAnyOutput
    ? '\n[PASS] got at least one output (final or pre-mod partial)'
    : '\n[FAIL] no image recovered — investigate attempts above');
  process.exit(hasAnyOutput ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
