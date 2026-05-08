#!/usr/bin/env node
/**
 * Test 16: iThink swarm route with Miyuri prompt.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const HOST = process.env.HOST ?? 'http://localhost:3005';
const OUT = join(process.cwd(), 'testoutput');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

const PROMPT = `Vogue Korea luxury editorial. Commercial lingerie campaign photography for Miyuri brand. Dimly lit interior, dark matte wall, single warm tungsten lamp from camera-right at 30°, 2800K, amber light passes through transparent mesh fabric revealing skin tone beneath, deep shadow zones camera-left, no flash, no daylight. Medium shot, 85mm equivalent, f/2.0 shallow depth of field, warm bokeh background. Korean woman, 21 years old, fair skin with cool ivory undertone, Fitzpatrick I, fine pores barely visible, warm amber specular highlights on cheekbones and collarbone, natural skin texture with subtle micro-contrast — not airbrushed. Straight jet-black hair, blunt mid-length cut, falling over one shoulder. Single eyelid, light brown iris, direct composed gaze. Delicate jaw, straight refined nose. Fully transparent fine-gauge mesh bralette — minimal underwire seam at base, thin adjustable spaghetti straps, completely sheer mesh construction, fabric catches amber lamp light creating warm translucent glow. Matching transparent mesh high-waist brief — fine-gauge mesh body, narrow waistband seam, completely sheer construction. Body angled 20° from camera axis, weight on left hip, right arm loosely at side, composed direct gaze. Deep blacks, warm amber light through sheer mesh, cinematic grade lifted blacks. Photorealism. No text, no watermarks, no extra objects.`;

const SWARM = parseInt(process.env.SWARM ?? '10');

const t0 = Date.now();
const res = await fetch(`${HOST}/api/scrape-ithink-swarm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: PROMPT,
    swarmSize: SWARM,
    stopOnFirst: true,
    budgetMs: 180_000,
    settings: { model: 'gpt-image-2', size: '1024x1536', quality: 'high', moderation: 'low' },
  }),
});
const elapsed = Date.now() - t0;
const json = await res.json();
console.log(`[test16] HTTP ${res.status} in ${elapsed}ms`);
console.log(JSON.stringify({
  ok: json.ok,
  swarmSize: json.swarmSize,
  elapsedMs: json.elapsedMs,
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
    const file = join(OUT, `miyuri-ithink-swarm-WIN-${STAMP}.png`);
    writeFileSync(file, buf);
    console.log(`\nSAVED winner: ${file} (${buf.length} bytes)`);
  }
}

writeFileSync(join(OUT, `miyuri-ithink-swarm-${STAMP}.json`), JSON.stringify(json, null, 2));
console.log(`\n${json.ok ? '[PASS] got image' : '[FAIL] all attempts blocked'}`);
