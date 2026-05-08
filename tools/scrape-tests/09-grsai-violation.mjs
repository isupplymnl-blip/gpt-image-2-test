#!/usr/bin/env node
/**
 * Test 9: GrsAI scrape VIOLATION path.
 * Use a prompt known to trigger content policy so we can verify:
 *   - URL appears in result[] before status flips to "violation"
 *   - CDN serves the image even after API flips the status
 *
 * PROMPT must be something GrsAI actually blocks. Tune via env if needed.
 */
const HOST = process.env.HOST ?? 'http://localhost:3005';
// Adjust this if GrsAI doesn't block it — try mildly risque / brand-adjacent
const PROMPT = process.env.PROMPT
  ?? 'Hyper realistic portrait of a blood-covered injured fighter lying in a dimly lit alley after violent combat';

const t0 = Date.now();
const res = await fetch(`${HOST}/api/scrape-grsai`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: PROMPT,
    model: 'gpt-image-2',
    aspectRatio: '1024x1024',
    pollIntervalMs: 200,  // poll aggressively to catch URL before flip
    maxWaitMs: 180000,
    captureAllRevisions: true,
  }),
});
const elapsed = Date.now() - t0;
const json = await res.json();
console.log(`[test9] HTTP ${res.status} in ${elapsed}ms`);
console.log(JSON.stringify({
  ok: json.ok,
  taskId: json.taskId,
  finalStatus: json.finalStatus,
  blocked: json.blocked,
  preModerationImageUrl: json.preModerationImageUrl,
  preModerationSourceUrl: json.preModerationSourceUrl,
  allUrls: json.allUrls,
  firstUrlAfterMs: json.firstUrlAfterMs,
  urlToFinalMs: json.urlToFinalMs,
  pollCount: json.pollCount,
  error: json.error,
}, null, 2));

// PASS if we got an image OR we proved the race window (firstUrl before violation)
const raceWon = json.preModerationImageUrl != null;
const blockedButCaptured = json.finalStatus === 'violation' && raceWon;
console.log(
  blockedButCaptured ? '\n[PASS] BLOCKED but image recovered — race won!' :
  raceWon ? '\n[PASS] Image recovered (not blocked this run)' :
  '\n[FAIL] neither blocked-with-recovery nor clean success',
);
process.exit(raceWon ? 0 : 1);
