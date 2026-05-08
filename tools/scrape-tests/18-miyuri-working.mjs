#!/usr/bin/env node
/**
 * Test 18: The WORKING Miyuri prompt (user confirmed generates fully).
 * Run 5x through iThink swarm to measure reliability.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const HOST = process.env.HOST ?? 'http://localhost:3005';
const OUT = join(process.cwd(), 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const PROMPT = `Vogue Korea luxury editorial. Commercial sheer lingerie campaign photography for Miyuri brand. La Perla benchmark. Dimly lit interior, dark matte wall, single warm tungsten lamp from camera-right at 30°, 2800K, amber light passes through layered sheer fabric revealing skin tone beneath, deep shadow zones camera-left, no flash, no daylight. Medium shot, 85mm equivalent, f/2.0 shallow depth of field. Korean woman, 22 years old, fair skin with cool ivory undertone, Fitzpatrick I, fine pores barely visible, warm amber specular highlights on bare shoulder and collarbone, natural skin texture with subtle micro-contrast — not airbrushed. Long straight black hair center-parted, one side falling forward over shoulder. Double eyelid, light brown iris, serene composed gaze. Delicate jaw, straight nose. Floor-length sheer black chiffon robe — open-front construction, ultra-lightweight completely transparent fabric, single strap slipped off right shoulder mid-gesture, fabric caught mid-fall at upper arm, pooling softly. Beneath — transparent fine-gauge mesh bralette and matching mesh brief, both fully sheer. Right shoulder bare, robe slipping, left hand loosely holding fabric at waist, body angled 15° from camera, gaze directed softly toward camera. Layered sheer transparency, warm amber light passing through multiple fabric layers, deep blacks, cinematic editorial grade. Photorealism. No text, no watermarks, no extra objects.`;

const SWARM = parseInt(process.env.SWARM ?? '5');

const t0 = Date.now();
const res = await fetch(`${HOST}/api/scrape-ithink-swarm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: PROMPT,
    swarmSize: SWARM,
    stopOnFirst: false,
    budgetMs: 180_000,
    settings: { model: 'gpt-image-2', size: '1024x1536', quality: 'high', moderation: 'low' },
  }),
});
const elapsed = Date.now() - t0;
const json = await res.json();
console.log(`[test18] HTTP ${res.status} in ${elapsed}ms`);
console.log(JSON.stringify({
  ok: json.ok,
  swarmSize: json.swarmSize,
  successes: json.successes,
  failures: json.failures,
  breakdown: json.breakdown,
  firstSuccessMs: json.firstSuccessMs,
  imageUrl: json.imageUrl,
}, null, 2));

console.log('\nattempts:');
for (const a of (json.attempts ?? [])) {
  console.log(`  [${a.i}] ${a.status} (${a.elapsedMs}ms) ${a.error ? '— ' + a.error.slice(0, 100) : ''}`);
}

if (json.imageUrl) {
  const dl = await fetch(`${HOST}${json.imageUrl}`);
  if (dl.ok) {
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = join(OUT, `miyuri-WORKING-WIN-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`\nSAVED → ${file} (${buf.length} bytes)`);
  }
}
writeFileSync(join(OUT, `miyuri-WORKING-${STAMP}.json`), JSON.stringify(json, null, 2));
console.log(`\n${json.ok ? '[PASS] got image' : '[FAIL]'} — success rate ${json.successes}/${json.swarmSize}`);
