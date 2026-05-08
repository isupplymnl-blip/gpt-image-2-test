#!/usr/bin/env node
/**
 * iThink bulk probe — fire N parallel requests with Miyuri prompt, capture
 * every response (success + failure) to see what failure responses look like.
 * If failures include URL/b64 we can scrape them. If not, we just rely on
 * the 80% success rate.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/miuri/Documents/GitHub/ai studio/gpt-image-2-test';
const OUT = join(ROOT, 'testoutput');
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; }));

const BASE = (env.ITHINK_OPENAI_BASE_URL || 'https://token.ithinkai.cn').replace(/\/$/, '');
const KEY = env.ITHINK_OPENAI_API_KEY;

const PROMPT = `Vogue Korea luxury editorial. Commercial lingerie campaign photography for Miyuri brand. Dimly lit interior, dark matte wall, single warm tungsten lamp from camera-right at 30°, 2800K, amber light passes through transparent mesh fabric revealing skin tone beneath, deep shadow zones camera-left, no flash, no daylight. Medium shot, 85mm equivalent, f/2.0 shallow depth of field, warm bokeh background. Korean woman, 21 years old, fair skin with cool ivory undertone, Fitzpatrick I, fine pores barely visible, warm amber specular highlights on cheekbones and collarbone, natural skin texture with subtle micro-contrast — not airbrushed. Straight jet-black hair, blunt mid-length cut, falling over one shoulder. Single eyelid, light brown iris, direct composed gaze. Delicate jaw, straight refined nose. Fully transparent fine-gauge mesh bralette — minimal underwire seam at base, thin adjustable spaghetti straps, completely sheer mesh construction, fabric catches amber lamp light creating warm translucent glow. Matching transparent mesh high-waist brief — fine-gauge mesh body, narrow waistband seam, completely sheer construction. Body angled 20° from camera axis, weight on left hip, right arm loosely at side, composed direct gaze. Deep blacks, warm amber light through sheer mesh, cinematic grade lifted blacks. Photorealism. No text, no watermarks, no extra objects.`;

const N = parseInt(process.env.N ?? '10');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

async function fireOne(i) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: PROMPT,
        size: '1024x1536',
        quality: 'high',
        moderation: 'low',
      }),
    });
    const txt = await res.text();
    const elapsed = Date.now() - t0;
    const ct = res.headers.get('content-type') ?? '';
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch { /* */ }

    const record = {
      i, http: res.status, ct, elapsed_ms: elapsed,
      hasUrl: !!parsed?.data?.[0]?.url,
      hasB64: !!parsed?.data?.[0]?.b64_json,
      errorMsg: parsed?.error?.message ?? null,
      fullKeys: parsed ? Object.keys(parsed) : [],
      rawSnippet: txt.slice(0, 300),
    };

    // Download successful image
    if (parsed?.data?.[0]?.url) {
      try {
        const dl = await fetch(parsed.data[0].url);
        if (dl.ok) {
          const buf = Buffer.from(await dl.arrayBuffer());
          const file = join(OUT, `miyuri-ithink-${i}-OK-${STAMP}.png`);
          writeFileSync(file, buf);
          record.savedFile = file;
          record.bytes = buf.length;
        }
      } catch (e) { record.dlErr = e.message; }
    }

    // If error response contains any URL-like field, capture it
    if (parsed?.error) {
      const stringified = JSON.stringify(parsed.error);
      const urlMatch = stringified.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp)/i);
      if (urlMatch) record.errorEmbeddedUrl = urlMatch[0];
    }

    return record;
  } catch (e) {
    return { i, error: e.message, elapsed_ms: Date.now() - t0 };
  }
}

console.log(`Firing ${N} parallel iThink requests...`);
const t0 = Date.now();
const results = await Promise.all(Array.from({ length: N }, (_, i) => fireOne(i)));
const elapsed = Date.now() - t0;

const successes = results.filter(r => r.hasUrl || r.hasB64);
const failures = results.filter(r => !r.hasUrl && !r.hasB64);

console.log(`\nTotal: ${elapsed}ms`);
console.log(`Success: ${successes.length}/${N}`);
console.log(`Failure: ${failures.length}/${N}`);
console.log('\n=== failures (error messages) ===');
for (const f of failures) {
  console.log(`  [${f.i}] HTTP ${f.http} (${f.elapsed_ms}ms): ${f.errorMsg?.slice(0, 150)}${f.errorEmbeddedUrl ? ' | URL_FOUND=' + f.errorEmbeddedUrl : ''}`);
}
console.log('\n=== successes ===');
for (const s of successes) {
  console.log(`  [${s.i}] OK ${s.elapsed_ms}ms → ${s.savedFile ? s.bytes + 'b' : 'no-file'}`);
}

writeFileSync(join(OUT, `miyuri-ithink-bulk-${STAMP}.json`), JSON.stringify({ N, elapsed_ms: elapsed, successes: successes.length, failures: failures.length, results }, null, 2));
console.log(`\nFull report → testoutput/miyuri-ithink-bulk-${STAMP}.json`);
