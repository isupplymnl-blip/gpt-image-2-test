# Director Output — Before vs After Playbook

Compares the Master Prompt the Director produces for OpenAI **before** the playbook rules were wired in vs **after**. Each scenario shows:

- **Before** — what the Director used to output (Gemini-style carried over)
- **After** — what the Director now outputs with the hard rules active
- **Rule matrix** — which playbook sections apply

---

## Scenario 1: Product Hero Shot (clean, no text)

**Inputs:** brushed aluminum water bottle, white seamless studio, single image, 1:1, IG Feed.

### Before

```
[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]
A stunning product shot of a brushed aluminum water bottle on a white background.
Professional product photography with perfect lighting and high quality. The bottle
is elegantly positioned in the center of the frame with beautiful reflections.
Shot on Hasselblad X2D 100C, 85mm f/1.4, ISO 100, RAW — hyperrealistic editorial
photography — 8K resolution — cinematic depth of field — professional commercial
lighting — no distortion — skin texture visible — photojournalistic realism.
```

**Problems:**
- `stunning`, `perfect lighting`, `beautiful`, `elegantly` — vague praise
- `skin texture visible` leaked from model template — product has no skin
- Gemini-era stacked quality tags (`8K`, `cinematic`, `hyperrealistic`) without justification
- No 5-slot structure
- No constraint line

### After

```
[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]
White seamless studio background, evenly lit. Brushed aluminum water bottle, 18oz,
matte finish with faint vertical grain, screw-top lid, standing upright at 3/4
angle left. Soft key light from upper left at 45° (5500K), subtle fill bounce
from camera right, clean rim highlight defining the bottle's right edge. Light
drop shadow anchoring the base. Sharp focus edge-to-edge, commercial product
photography, 100mm macro feel. No text, no extra objects, no reflections of other
objects, no props.
```

**Rule matrix:**
| Section | Applied |
|---|---|
| §1 Front-load structure | ✅ Scene → Subject → Key details → Constraints |
| §5 Lighting + materials | ✅ 45°, 5500K, matte grain, screw-top, rim highlight |
| §6 Anti-slop | ✅ `stunning/perfect/beautiful` removed |
| §6 Quality levers | ✅ Hasselblad tag dropped (not needed at 1024), `photorealism` implicit via specificity |
| Constraint line | ✅ `no text, no extra objects…` |

---

## Scenario 2: Marketing Page with Text Overlay

**Inputs:** AirPods Pro, headline `SILENCE. PERFECTED.`, tagline `AirPods Pro. Now with USB-C.`, 3 feature callouts, CTA button `Shop now`. 4:5 IG ad.

### Before

```
[API:openai,model=gpt-image-2,quality=high,size=1024x1280,format=png]
A stunning marketing page for AirPods Pro featuring the product prominently
centered. Include a bold headline saying Silence Perfected, a tagline about
AirPods Pro with USB-C, three feature callouts for Active Noise Cancellation,
Adaptive Audio, and Personalized Spatial Audio, and a call to action button
saying Shop now. Clean minimalist design, professional typography, high quality
commercial photography. Shot on Hasselblad X2D 100C, 85mm f/1.4, ISO 100, RAW —
hyperrealistic editorial photography — 8K resolution.
```

**Problems:**
- Text unquoted (`saying Silence Perfected`) → will be paraphrased or hallucinated
- No typography spec (font, size, weight, color, position)
- No per-text-block quoting
- No anti-duplication constraint
- Photography-grade quality tags on a poster/graphic layout (§6 says drop them)

### After

```
[API:openai,model=gpt-image-2,quality=high,size=1024x1280,format=png]
Minimalist off-white background (#FAFAFA), vertical 4:5 marketing page layout.
AirPods Pro case with one earbud beside it, centered in upper 55% of frame, soft
diffused top light with subtle drop shadow below. Typography: bold sans-serif
headline "SILENCE. PERFECTED.", centered under the product, 7% of frame height,
black (#0A0A0A). Below it, medium-weight serif tagline "AirPods Pro. Now with
USB-C.", centered, 3% of frame height, graphite (#3A3A3A). Three evenly-spaced
feature callouts in a horizontal row near bottom: "Active Noise Cancellation",
"Adaptive Audio", "Personalized Spatial Audio" — light sans-serif, 2% of frame
height, graphite. Pill-shaped CTA button at very bottom center reading "Shop now"
in white sans-serif on a solid black pill. Clean editorial graphic layout, flat
design. No extra text, no duplicate letters, no hallucinated words, single
headline only.
```

**Rule matrix:**
| Section | Applied |
|---|---|
| §1 Front-load + 5-slot | ✅ Scene → Subject → Details → Typography (huge block) → Constraints |
| §2 Quote each text block | ✅ Every piece of copy in its own `"..."` |
| §2 Typography spec | ✅ Font style, size as % of frame, weight, color |
| §2 No-extras constraint | ✅ `no extra text, no duplicate letters, no hallucinated words, single headline only` |
| §6 Drop photo quality tags | ✅ No Hasselblad/8K — this is a graphic layout |

---

## Scenario 3: Edit with 3 References (Virtual Try-On)

**Inputs:** base image of model, jacket reference, boots reference. User wants the outfit applied while preserving identity and scene.

### Before

```
[API:openai,model=gpt-image-2,quality=high,size=1024x1536,format=png]
A model wearing a beautiful jacket and stylish boots in an urban setting. The
jacket and boots should match the reference images provided. Keep the overall
look professional and editorial. Shot on Hasselblad X2D 100C, 85mm f/1.4.
```

**Problems:**
- Zero image labeling — model has to guess which ref is canonical
- No preserve list → model will drift face/pose/background
- No change declaration
- Vague `match the reference images`
- No `input_fidelity` recommendation

### After

```
[API:openai,model=gpt-image-2,quality=high,size=1024x1536,format=png,input_fidelity=high]
Image 1: base scene to preserve — the model in her current pose, outdoor urban background, golden hour lighting.
Image 2: jacket to composite onto the subject in Image 1 — oversized cream wool coat, mid-thigh length, notched lapels.
Image 3: boots to composite onto the subject in Image 1 — knee-high black leather riding boots with buckle detail.

Instruction: Apply the jacket from Image 2 and the boots from Image 3 to the
subject in Image 1. Replace her current jacket with Image 2's coat; replace her
current footwear with Image 3's boots. Keep Image 1's face, hair, skin tone,
pose, body proportions, hand positions, urban background, sidewalk, storefront
details, golden hour color temperature, and camera angle completely unchanged.
Render realistic fabric folds, natural shadows where the coat meets the shoulders,
and contact shadows under the boots matching the existing light direction.
No new elements, no changes to facial features, no duplicate limbs, no background
reinterpretation.
```

**Rule matrix:**
| Section | Applied |
|---|---|
| §3 Multi-ref labeling | ✅ `Image 1/2/3: <role>` declared explicitly |
| §3 Reference labels in instruction | ✅ `Apply Image 2… Image 3…` |
| §4 Preserve-and-change | ✅ Both `Replace…` and full `Keep…` list |
| §4 Preserve list specific | ✅ face, hair, skin tone, pose, bg, light temp, camera angle |
| `input_fidelity: high` | ✅ Added to API tag (identity matters) |
| Constraints | ✅ `no new elements, no changes to facial features, no duplicate limbs` |

---

## Scenario 4: 4-Slide Carousel (Reels)

**Inputs:** Brand carousel for skincare. Same model across 4 slides, different props/angles. 9:16 for Reels.

### Before

```
SLIDE 1
[API:openai,model=gpt-image-2,quality=high,size=1024x1820,format=png]
A beautiful skincare model in a bright bathroom holding a serum bottle.
Natural lighting, fresh aesthetic, professional beauty photography.

SLIDE 2
[API:openai,model=gpt-image-2,quality=high,size=1024x1820,format=png]
Same model looking in a mirror applying serum. Clean, minimal, aspirational.

SLIDE 3
[API:openai,model=gpt-image-2,quality=high,size=1024x1820,format=png]
Close-up of the serum bottle on a marble countertop with some plants.

SLIDE 4
[API:openai,model=gpt-image-2,quality=high,size=1024x1820,format=png]
Product hero shot of the serum bottle, standalone, white background.
```

**Problems:**
- `beautiful`, `aspirational`, `fresh aesthetic` — anti-slop violations
- No ref labeling for the model-consistency ref
- Size `1024x1820` → 1820 is NOT a multiple of 16 (§7 violation — API will reject or auto-snap)
- No preserve language for model identity across slides
- Slide 4 is a graphic/hero shot but still flagged for photography tags

### After

```
SLIDE 1 [PLATE: PRIMARY]
[API:openai,model=gpt-image-2,quality=high,size=1024x1824,format=png,input_fidelity=high]
Image 1: model identity reference — preserve face, hair, skin tone across all slides.
Bright minimal bathroom, morning daylight through a frosted window (5500K). Model
(from Image 1) standing in front of a white tiled wall, 3/4 body frame, holding a
30ml amber glass serum bottle with dropper cap at chest height. Soft diffused key
light from camera-left window, subtle fill from right. Cool neutral palette: white
tiles, pale oak counter, brushed nickel fixtures. 9:16 vertical composition, model
in upper two-thirds, product visible in hands. Editorial beauty photography, clean
minimal aesthetic, candid unposed energy. Keep model's face, hair, and body unchanged
from Image 1. No extra text, no duplicate objects, no anatomical errors.

SLIDE 2 [PLATE: PRIMARY]
[API:openai,model=gpt-image-2,quality=high,size=1024x1824,format=png,input_fidelity=high]
Image 1: model identity reference — same face, hair, skin tone as Slide 1.
Same bathroom scene as Slide 1, same 5500K daylight, same white-tile/oak palette.
Model (from Image 1) now facing a round mirror above the counter, 3/4 rear-angle
view, applying a drop of serum to her left cheekbone with her fingertip. Mirror
reflection shows her face softly. Key light unchanged. Candid natural micro-expression,
eyes on her own reflection. Preserve model's face, hair, skin tone, bathroom
environment, and light direction from Slide 1. No new elements, no text.

SLIDE 3 [PLATE: OVERRIDE — flat lay, camera angle differs]
[API:openai,model=gpt-image-2,quality=high,size=1024x1824,format=png]
Overhead flat lay, camera pointing straight down. Pale oak counter surface, soft
daylight from camera-left (5500K). Centered: 30ml amber glass serum bottle with
dropper cap (matching Slides 1–2). Props around it: three eucalyptus sprigs upper
left, a folded linen cloth lower right, two water droplets on the counter near the
bottle. Shallow depth of field, bottle label sharp. Minimal negative space.
No model, no text, no competing objects.

SLIDE 4 [PLATE: NEW — product hero, separate plate]
[API:openai,model=gpt-image-2,quality=high,size=1024x1824,format=png,background=transparent]
White seamless studio background (or transparent PNG). 30ml amber glass serum
bottle with dropper cap, centered, standing upright, slight 3/4 angle right.
Soft top-down key light, subtle rim highlight on the left edge of the glass,
light drop shadow below. Label sharp and legible, glass showing warm amber
interior. Commercial product photography, crisp detail. No text, no props,
no background elements.
```

**Rule matrix:**
| Section | Applied |
|---|---|
| §3 Ref labeling | ✅ `Image 1: model identity reference` declared on slides 1, 2 |
| §4 Preserve across slides | ✅ Each slide restates preserve list (face, hair, scene continuity) |
| §6 Anti-slop | ✅ `beautiful/aspirational/fresh` removed |
| §6 Selective quality levers | ✅ `candid, unposed` for lifestyle; no Hasselblad stack |
| §7 Size constraint | ✅ `1024×1824` (1824 IS a multiple of 16); was `1024×1820` (invalid) |
| §8 `input_fidelity: high` | ✅ On slides that need identity lock |
| §8 `background: transparent` | ✅ On hero slide for compositing flexibility |
| Camera audit | ✅ Plate flags `PRIMARY / OVERRIDE / NEW` preserved |

---

## Summary Matrix — What the Playbook Changes

| Category | Before (Gemini-carry-over) | After (Playbook-compliant) |
|---|---|---|
| Structure | Narrative prose, no fixed order | 5-slot front-loaded: Scene → Subject → Details → Typography → Constraints |
| Vague praise | `stunning / beautiful / perfect / elegant` everywhere | Replaced with visual facts (color, °K, angle, material) |
| Text in image | Unquoted, no typography spec | Every copy block quoted + font/size/weight/color/position |
| Multi-ref | Refs sent, no labels in prompt | `Image 1/2/3: <role>` declared in prompt body |
| Edits | Change stated, preserve implicit | Full `Keep…` list explicit and repeated every iteration |
| Quality tags | Always-on Hasselblad/8K stack | Kept for photorealism, dropped for graphic/illustration |
| Size | Freely chosen (sometimes invalid) | Validated against 4 constraints (÷16, ≤3:1, 655K–8.29M px) |
| `input_fidelity` | Never set | `high` added when identity/product preservation matters |
| Constraints | Usually omitted | `no extra text, no duplicate letters, no new elements…` line |

---

## What Does NOT Change

The playbook layer is additive. These continue unchanged:

- **All 9 agents** — Brand DNA / Concept / Model / Setting / Product / Supervisor / Director / Copy / Prompt Repair roles intact
- **Humanizer Pass** (Step 8) — still runs
- **Camera Angle Audit** (Step 7) — still runs; plate flags `[PLATE: PRIMARY / OVERRIDE / NEW]` preserved
- **Director Stitching Formula** — still drives the composition, now just re-ordered into the 5-slot structure at the final step
- **Content Filter Checklist** (Step 8.5) — swimwear/minimal-clothing fashion taxonomy still enforced
- **Gemini flow** — playbook rules only fire when `provider === 'openai'`. Gemini prompts are unaffected
