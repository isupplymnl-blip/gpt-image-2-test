#!/usr/bin/env node
/**
 * Test 8: GrsAI native async scraper.
 * Benign prompt — measures timing, verifies CDN download works.
 */
const HOST = process.env.HOST ?? 'http://localhost:3005';
const PROMPT = process.env.PROMPT ?? 'A serene mountain lake at golden hour, photorealistic';

const t0 = Date.now();
const res = await fetch(`${HOST}/api/scrape-grsai`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: PROMPT,
    model: 'gpt-image-2',
    aspectRatio: '1024x1024',
    pollIntervalMs: 250,
    maxWaitMs: 180000,
  }),
});
const elapsed = Date.now() - t0;
const json = await res.json();
console.log(`[test8] HTTP ${res.status} in ${elapsed}ms`);
console.log(JSON.stringify({
  ok: json.ok,
  taskId: json.taskId,
  finalStatus: json.finalStatus,
  blocked: json.blocked,
  preModerationImageUrl: json.preModerationImageUrl,
  preModerationSourceUrl: json.preModerationSourceUrl,
  firstUrlAfterMs: json.firstUrlAfterMs,
  urlToFinalMs: json.urlToFinalMs,
  pollCount: json.pollCount,
  error: json.error,
}, null, 2));

const pass = json.ok && json.preModerationImageUrl;
console.log(pass ? '\n[PASS] got pre-mod image from GrsAI' : '\n[FAIL] no image recovered');
process.exit(pass ? 0 : 1);
