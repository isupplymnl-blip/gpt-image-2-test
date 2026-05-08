// GrsAI lingerie viability test — opaque constructions only.
// Five slides, different opaque garments + settings. All solid-lined fabrics.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const env = {};
const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const API_KEY = env.GRSAI_API_KEY;
const BASE = (env.GRSAI_BASE_URL || 'https://grsaiapi.com').replace(/\/$/, '');
if (!API_KEY) { console.error('GRSAI_API_KEY missing'); process.exit(1); }

const slides = [
  {
    name: 'slide1-satin-bralette-set',
    prompt: 'Vogue Korea luxury editorial. Miyuri brand commercial lingerie campaign. Dimly lit interior, matte charcoal wall, warm tungsten key light camera-right at 30°, 2800K, soft shadow falloff camera-left. Medium shot, 85mm equivalent, f/2.8. Korean woman, 25 years old, natural fair skin with subtle micro-texture, relaxed confident expression. Long straight black hair loosely falling past shoulders. Ivory silk-satin fully-lined triangle bralette — double-layer opaque charmeuse construction, adjustable satin straps, narrow picot trim at neckline, solid cup lining, matching ivory fully-lined high-waist brief with opaque satin front panel and covered elastic waistband. Standing three-quarter to camera, weight on left hip, right hand relaxed at hip, chin neutral. Warm cinematic grade, deep blacks, natural film grain. Photorealism. No text, no watermarks.',
  },
  {
    name: 'slide2-lace-overlay-bra-set',
    prompt: 'Vogue Korea editorial. Miyuri brand lingerie campaign. Soft morning studio light, seamless dove-grey backdrop, key light camera-left at 45° through large diffusion, gentle fill right, 5200K. Medium shot, 85mm, f/4. Korean woman, 26, fair skin with natural pores and warm peach undertone, composed neutral expression. Wavy shoulder-length dark brown hair. Blush-pink fully-lined balconette bra — opaque satin cup base with decorative eyelash-lace overlay on the outer surface only, solid lined interior, adjustable satin-covered straps, narrow bow at center gore, matching blush high-cut hipster brief with opaque fully-lined front panel and lace overlay trim at waistband. Standing square to camera, arms relaxed at sides, slight smile. Clean editorial grade, soft contrast, commercial catalog feel. Photorealism. No text, no watermarks.',
  },
  {
    name: 'slide3-knit-loungewear',
    prompt: 'Vogue Korea editorial. Miyuri brand loungewear campaign. Bright morning interior, large window camera-left, soft daylight 5600K, warm oak floor, linen drapes. Medium shot, 50mm, f/2.8. Korean woman, 24, natural fair skin with warm undertone, relaxed morning expression, bare feet. Long straight dark brown hair tucked behind one ear. Cream ribbed-knit cotton camisole — thick opaque knit construction, wide shoulder straps, scoop neckline, ribbed texture visible, matching cream ribbed-knit high-rise lounge shorts, elastic covered waistband, mid-thigh length, fully opaque knit. Seated on edge of unmade linen bed, knees together, hands resting on thighs, looking toward window. Soft lifestyle grade, natural color, airy. Photorealism. No text, no watermarks.',
  },
  {
    name: 'slide4-sports-bralette-set',
    prompt: 'Vogue Korea active editorial. Miyuri brand activewear-lingerie hybrid campaign. Studio with seamless warm-grey cyclorama, two large softboxes 45° left and right, even 5400K exposure, minimal shadow. Full body, 35mm, f/5.6. Korean woman, 27, fair skin, athletic build, confident direct gaze, minimal makeup. Short blunt black bob. Black technical double-knit sports bralette — fully opaque compression fabric, racerback, wide underbust band, flatlock seams, medium coverage, matching black high-waist biker short in opaque matte technical knit, mid-thigh length, wide waistband. Standing facing camera, feet shoulder width, hands at hips. Crisp commercial grade, neutral color, catalog-ready. Photorealism. No text, no watermarks.',
  },
  {
    name: 'slide5-silk-pajama-set',
    prompt: 'Vogue Korea editorial. Miyuri brand silk sleepwear campaign. Warm evening interior, single bedside lamp camera-right at 25°, 2800K, deep ambient shadow, matte walnut nightstand. Medium-close shot, 85mm, f/2.0. Korean woman, 28, porcelain fair skin with subtle natural texture, serene contemplative expression. Long straight jet-black hair. Deep navy silk charmeuse pajama set — fully opaque heavy-weight 22-momme silk, long-sleeve button-front shirt with contrast ivory piping at collar and cuffs, chest pocket, matching navy silk long trouser with elastic drawstring waist, full-length coverage, fabric draping softly. Seated upright on edge of bed, one knee over other, hands folded in lap, soft profile to camera. Warm cinematic grade, rich shadow, luxury catalog feel. Photorealism. No text, no watermarks.',
  },
];

const size = '1024x1280';
const results = [];
for (const s of slides) {
  const body = { model: 'gpt-image-2', prompt: s.prompt, size, quality: 'high', n: 1, moderation: 'low', output_format: 'png' };
  const started = Date.now();
  console.log(`[${s.name}] POST ...`);
  let res, text;
  try {
    res = await fetch(`${BASE}/v1/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (e) {
    console.error(`[${s.name}] network error:`, e.message);
    results.push({ slide: s.name, ok: false, error: 'network: ' + e.message });
    continue;
  }
  const elapsed = Date.now() - started;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (!res.ok) {
    console.error(`[${s.name}] FAIL ${res.status} (${elapsed}ms): ${text.slice(0, 200)}`);
    writeFileSync(join(__dirname, `${s.name}-${ts}.error.json`), JSON.stringify({ status: res.status, body: text.slice(0, 4000) }, null, 2));
    results.push({ slide: s.name, ok: false, status: res.status, elapsed_ms: elapsed, error_excerpt: text.slice(0, 300) });
    continue;
  }
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  const b64 = json?.data?.[0]?.b64_json;
  const url = json?.data?.[0]?.url;
  if (!b64 && !url) {
    console.error(`[${s.name}] FAIL no image in payload`);
    results.push({ slide: s.name, ok: false, error: 'no image', response_keys: json ? Object.keys(json) : [] });
    continue;
  }
  let pngBuf;
  if (b64) pngBuf = Buffer.from(b64, 'base64');
  else { const r = await fetch(url); pngBuf = Buffer.from(await r.arrayBuffer()); }
  const pngName = `${s.name}-${ts}.png`;
  writeFileSync(join(__dirname, pngName), pngBuf);
  console.log(`[${s.name}] OK ${elapsed}ms ${pngBuf.length}B file=${pngName}`);
  results.push({ slide: s.name, ok: true, status: 200, elapsed_ms: elapsed, bytes: pngBuf.length, file: pngName });
}

writeFileSync(join(__dirname, 'test-grsai-lingerie-summary.json'), JSON.stringify({ when: new Date().toISOString(), base: BASE, size, results }, null, 2));
const okCount = results.filter(r => r.ok).length;
console.log(`\n[summary] ${okCount}/${results.length} succeeded`);
