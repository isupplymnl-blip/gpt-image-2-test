# Nano Banana (Gemini Image) Prompting Rules

**When to apply:** every turn where the active provider is `gemini` (direct Google API) or `pudding-gemini` (Pudding proxy). These rules override generic prompting habits inside the agents. They do NOT replace Agents 1/2/3/4/5/6/7/8 — they shape HOW the Director stitches those outputs into the final Master Prompt for Nano Banana.

Distilled from Google Cloud's "Ultimate Prompting Guide for Nano Banana" + Google Blog Nano Banana Pro tips. Treat as defaults, not dogma.

---

## 1. Prompt Structure

Two valid frameworks — pick one per deliverable:

**Google 5-Element Framework** (editorial / illustration / design work):
```
Subject  →  Action  →  Location/Context  →  Composition  →  Style
```

**Internal Stitching Formula** (photoreal commercial work, lighting-first):
```
[SHOT TYPE + CAMERA]  →  [LIGHTING]  →  [MODEL]  →  [PRODUCT INTERACTION]  →
[SETTING]  →  [ATMOSPHERE/MOOD]  →  [STYLE REFERENCE]  →  [TECHNICAL QUALITY]
```

Always **start with a strong verb**: `Generate`, `Render`, `Photograph`, `Edit`, `Replace`, `Add`, `Remove`, `Apply`. Tells Gemini whether you're creating, editing, or transforming.

---

## 2. Five Best Practices (HARD)

1. **Be specific.** Concrete details on subject, lighting, composition. Replace `blue dress` with `navy blue tweed knee-length dress, structured shoulders`. Replace `good lighting` with `three-point softbox at 5500K, key from camera-left`.

2. **Positive framing.** State what you DO want, never what you don't.
   - ❌ `no cars on the street`
   - ✅ `an empty street`
   - Gemini sometimes inserts the negated element. Always rewrite as positive.

3. **Control the camera.** Use photographic and cinematic vocabulary: `low angle`, `aerial view`, `tilt-shift`, `wide-angle 24mm`, `f/1.8 shallow depth of field`, `Dutch tilt`. Richer camera vocabulary = more cinematic output.

4. **Iterate conversationally.** Refine in follow-up turns rather than restart. Gemini's chat preserves context across edits.

5. **Strong verb opening.** See §1.

---

## 3. Text Rendering Rules (HARD — Pro shines here)

1. **Always quote desired text.**
   - ✅ `render the headline "GLOW UP" centered`
   - ❌ `render a headline saying glow up`

2. **Specify fonts.** Name family + weight + size.
   - `Bold sans-serif, white, 12% of frame height`
   - `Brush Script, gold metallic`
   - `Century Gothic 12px`

3. **Translate / localize.** Gemini Pro renders in many languages.
   - `Render this menu in Japanese with proper typography`
   - `Translate the entire poster into Arabic with right-to-left layout`

4. **Text-first hack.** For tricky compositions, generate text concepts conversationally first, then request the image.

5. **Brand-mark accuracy.** For logos, attach a brand asset as a reference and write `match the logo from Image N exactly, preserving glyph shapes and clearspace`.

6. **Expect limits.** Small text (<2% of frame), highly stylized scripts, and dense paragraphs may still render with errors — verify before shipping.

---

## 4. Multi-Reference & Image Blending

Nano Banana accepts **up to 14 reference images** per call.

### Labeling Pattern

```
Image 1: <role> — <what to extract>
Image 2: <role> — <what to extract>
...

Instruction: <how to combine, what to preserve, what to change>
```

### Image Blending for Character Consistency

For carousels or campaigns with the same character across frames, blend up to 14 reference images of the same subject. Gemini synthesizes a stable identity from the union — use this instead of hoping seed+prompt produces the same face.

### Brand Consistency on 3D Surfaces

Apply logos/patterns while preserving texture and lighting:

> "Image 1: brand logo. Image 2: coffee mug. Apply the logo from Image 1 to the curved ceramic surface of the mug in Image 2 — match the mug's existing shadows, glaze reflectivity, and depth of field."

---

## 5. Prompting Like a Creative Director

Stack four lenses on every shot: lighting → camera → grading → materiality.

### Design Your Lighting

| Mood | Vocabulary |
|---|---|
| Studio neutral | `three-point softbox, 5500K, low contrast ratio` |
| Dramatic | `Chiaroscuro lighting, harsh high-contrast, single hard key` |
| Editorial | `Golden hour backlighting, long shadows, warm rim light` |
| Cinematic | `Practical lights only, mixed tungsten + neon, motivated by source` |
| Beauty | `Clamshell lighting, large softbox above + reflector below` |

### Camera Hardware

| Effect | Vocabulary |
|---|---|
| Immersive / distorted | `GoPro` |
| Authentic color | `Fujifilm` |
| Nostalgic flash | `disposable camera` |
| Editorial portrait | `Hasselblad X2D 100C, 85mm f/1.4` |
| Commercial product | `Phase One IQ4, 80mm f/8` |
| Street | `Sony A7R V, 50mm f/1.2` |

### Color Grading & Film Stock

- Nostalgic: `1980s color film, slightly grainy, warm fade`
- Modern moody: `cinematic color grading with muted teal tones, lifted blacks`
- Documentary: `flat color profile, neutral white balance`
- High fashion: `high saturation, deep blacks`

### Materiality & Texture

| Generic | Specific |
|---|---|
| `suit jacket` | `navy blue tweed with herringbone weave` |
| `surface` | `brushed aluminum with fingerprint smudges` |
| `glass` | `frosted glass with subtle waterspots` |
| `wood` | `weathered reclaimed oak with chipped paint` |

---

## 6. Resolution & Aspect Ratios

### Resolution Tiers

| Tier | Approximate pixels | Use |
|---|---|---|
| 0.5K | ~512px edge (Flash only) | Iteration, drafts |
| 1K | ~1024px edge | Standard production |
| 2K | ~2048px edge | High-quality web/social |
| 4K | ~3840px edge | Print, hero banners, retina |

**Provider caps:**
- **Direct Google API:** all tiers (0.5K Flash, 1K, 2K, 4K)
- **Pudding Gemini proxy:** **1K and 2K ONLY** — resolver floors unknown labels to 1K

### Aspect Ratios

**Both Pro and 2:** 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
**Nano Banana 2 only (ultra-wide):** 1:4, 4:1, 1:8, 8:1

| Platform | Ratio |
|---|---|
| IG Feed | 1:1 or 4:5 |
| IG Story / Reels / TikTok | 9:16 |
| YouTube thumbnail | 16:9 |
| LinkedIn portrait | 3:4 or 2:3 |
| Magazine landscape | 3:2 or 16:9 |
| Print poster | 3:4 or 5:4 |
| Wide cinematic banner | 21:9 |
| Skyscraper banner | 1:4 (Flash only) |
| Ultra-wide hero strip | 4:1 (Flash only) |

---

## 7. Real-Time Web Search Framework

Pattern:
```
[Source/Search request]  →  [Analytical task]  →  [Visual translation]
```

Enable via `tools: [{ googleSearch: {} }]`. Use when visuals depend on real-world facts (current weather, live events, trends, real landmarks).

---

## 8. API Parameters (Quick Ref)

Cross-link: full param surface is in `references/api-reference.md`.

```javascript
{
  responseModalities: ["TEXT", "IMAGE"],   // always include both
  temperature: 1.0,                         // 0.0–2.0
  topP: 0.97,                               // 0.0–1.0
  topK: 40,                                 // 1–100
  candidateCount: 2,                        // 1–4
  seed: 42,                                 // integer
  maxOutputTokens: 1000
}
```

### Tuning

| Goal | temperature | topP | topK | seed |
|---|---|---|---|---|
| Exact product accuracy | 0.3–0.5 | 0.90 | 20–30 | Fixed |
| Lifestyle / editorial | 0.9–1.1 | 0.97 | 40 | Fixed, vary ±5 |
| Maximum creativity | 1.2–1.5 | 0.99 | 60–80 | Multiple seeds |
| Consistent carousel | 0.7 | 0.93 | 32 | Same across all |

---

## 9. Iteration Workflow

1. Draft at **0.5K or 1K** + Flash model + temperature 1.0 + seed 42.
2. Refine conversationally in chat — adjust lighting, pose, framing via follow-up turns.
3. Lock the seed once composition is right.
4. Re-render at **2K or 4K** + Pro model for finals.
5. Seed variants (+1, +2, +7, +13, +58) for pose/light/atmosphere variation with same prompt.

---

## 10. Watermarking & Provenance

Every Nano Banana output carries:
- **C2PA** — cryptographic content credentials in metadata
- **SynthID** — invisible AI-watermark in pixels, detectable after compression/edit

Cannot opt out. Watermarks survive resize, screenshot, and most edits. For workflows needing "untraceable" output, Nano Banana is the wrong tool.

---

## 11. Failure Fixes

| Symptom | Fix |
|---|---|
| Plastic / airbrushed skin | Add `natural skin texture with subtle micro-contrast`, name Fitzpatrick type, use 3-part skin formula |
| Default light skin (model bias) | Explicit Fitzpatrick + tone + undertone every time |
| Text illegible / wrong chars | Quote exactly, specify font + weight + size, use Pro model, text-first hack |
| Identity drifts across edits | Fix seed, restate preserve list, multimodal blend same character ref |
| Negative phrasing got inverted | Rewrite positive: `no cars` → `empty street` |
| "Stock photo" feel | Use `candid, unposed, natural micro-expression`; drop generic quality stack |
| Compositing pasted-on | Name lighting on EACH layer + composite: `match Image 1's golden hour light direction` |
| Real-world detail wrong | Enable `googleSearch` tool, apply Web Search Framework |

---

## 12. Director Integration Notes

These rules ADD TO (do not replace) the existing agent pipeline:

- **Agent 1 (Concept)** — build the Creative Brief using the 5-element framework when work is editorial/illustration; use internal stitching formula when photoreal.
- **Agent 2 (Model)** — keep the 6-dimension framework. Enforce the 3-part skin formula and one anti-plastic phrase every time.
- **Agent 3 (Setting)** — lighting-first ordering still stands. Use §5 vocabulary for specific lighting + materials.
- **Agent 4 (Product)** — product accuracy language unchanged. When a product ref is attached, declare `Image N: <product> reference — match shape/color/material/branding exactly.` per §4.
- **Agent 5 (Supervisor)** — pick temperature/topP/topK/seed per §8. Select Flash vs Pro per §6 resolution target and deliverable quality.
- **Agent 6 (Director)** — at Humanizer Pass (Step 8), enforce §2 positive framing + §3 text rules. At stitching, open with a strong verb per §1.
- **Agent 7 (Copy)** — when output renders text-in-image, use §3 quoted-text + typography rules.
- **Agent 8 (Prompt Repair)** — use §11 failure fixes as the first diagnostic pass.

---

## 13. Compatibility with Existing Rules

- **NO INDENT RULE** (Master Prompt is one continuous block) — still applies.
- **Quality Tags** (Director Step 8 — `Shot on Hasselblad X2D 100C...`) — keep for photorealism, drop for illustration/poster.
- **[API:] tag on line 1** — still applies. Format: `[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42, ratio=1:1, resolution=2K]`.
- **Reference image role enrichment** happens at TWO layers: Director declares `Image N:` labels in the prompt body (§4); the generate route attaches the actual bytes. Both layers reinforce each other.
- **Seed exploration tables** from `prompt-patterns.md` — still proven.

---

## 14. Checklist (pre-generation)

- [ ] Strong verb opening (Generate / Render / Photograph / Edit / Apply)
- [ ] Framework chosen (5-element or internal stitching)
- [ ] Positive framing — no negation language
- [ ] Camera vocabulary (lens / angle / depth of field)
- [ ] Lighting specific (direction + source + color temperature)
- [ ] Materiality named
- [ ] Skin formula applied for human subjects
- [ ] Anti-plastic phrase included
- [ ] Text quoted exactly + font + size + position
- [ ] Image N labels declared if multimodal
- [ ] Aspect ratio matches platform
- [ ] Resolution tier appropriate (check Pudding cap if applicable)
- [ ] Seed strategy chosen (fixed vs varied)
- [ ] Web search enabled if real-world facts matter
