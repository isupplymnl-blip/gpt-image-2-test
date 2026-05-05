# Nano Banana (Gemini Image) Prompting Playbook

Distilled from Google Cloud's official guide, Google blog Nano Banana Pro tips, our internal `nano-banana-creator/references/*` library, and production testing. Treat as defaults, not dogma.

---

## Table of Contents

1. [Model Overview](#model-overview)
2. [Tech Specs](#tech-specs)
3. [Core Prompt Structure](#core-prompt-structure)
4. [Five Best Practices](#five-best-practices)
5. [Five Prompting Frameworks](#five-prompting-frameworks)
6. [Text Rendering Rules](#text-rendering-rules)
7. [Multi-Reference & Image Blending](#multi-reference--image-blending)
8. [Lighting, Camera, Grading, Material](#lighting-camera-grading-material)
9. [Resolution & Aspect Ratios](#resolution--aspect-ratios)
10. [API Parameters](#api-parameters)
11. [Iteration Workflow](#iteration-workflow)
12. [Real-Time Web Search Framework](#real-time-web-search-framework)
13. [Watermarking & Provenance](#watermarking--provenance)
14. [Failure Modes & Fixes](#failure-modes--fixes)
15. [Cost & Performance](#cost--performance)
16. [Limitations](#limitations)
17. [Quick Reference Checklist](#quick-reference-checklist)

---

## Model Overview

Nano Banana models are built on the Gemini 3 family. They apply deep reasoning to interpret prompts before generating images. Two production variants:

| Variant | API String | Best For | Reference Limits |
|---|---|---|---|
| **Nano Banana Pro** | `gemini-3-pro-image-preview` | Premium quality, complex text-in-image, high-fidelity reasoning, brand-grade work | 6 high-fidelity objects + 5 character refs (11 total) |
| **Nano Banana 2** | `gemini-3.1-flash-image-preview` | Faster, web-search powered, Image Search, broader aspect-ratio support including ultra-wide, high-volume production | 10 high-fidelity objects + 4 character refs (14 total) |
| Nano Banana (base) | `gemini-2.5-flash-image` | Lightweight legacy, fastest, lowest latency | Unknown limits |

**Default recommendation:** `gemini-3.1-flash-image-preview` for commercial product + model shots; `gemini-3-pro-image-preview` when text accuracy or scene complexity is critical.

**New capabilities (Gemini 3):**
- **Thinking mode** — model reasons before generating (`thinking_level: "High"`)
- **Image Search** — 3.1 Flash can search web for visual context (cannot search people)
- **Thought signatures** — preserve reasoning context across multi-turn edits

---

## Tech Specs

| Feature | Nano Banana Pro | Nano Banana 2 |
|---|---|---|
| Max input tokens | 65,536 | 131,072 |
| Max output tokens | 32,768 | 32,768 |
| Resolutions | 1K, 2K, 4K | 0.5K, 1K, 2K, 4K |
| Aspect ratios | 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 | Same + 1:4, 4:1, 1:8, 8:1 |
| Reference images (multimodal) | up to 14 | up to 14 |
| Image blending (character consistency) | up to 6–14 images | up to 6–14 images |
| MIME types | PNG, JPEG, WEBP, HEIC, HEIF | Same |
| Doc input max size | 50 MB (API/GCS), 7 MB (console) | Same |
| Knowledge cutoff | January 2025 | January 2025 |
| Live web search | Yes | Yes |
| Watermarking | C2PA + SynthID (always on) | C2PA + SynthID (always on) |

---

## Core Prompt Structure

### Pro 5-Element Framework

```
Subject  →  Action  →  Location/Context  →  Composition  →  Style
```

Start with a **strong verb** that names the primary operation (`Generate`, `Render`, `Photograph`, `Compose`, `Edit`). Gemini reads narrative prose well — full sentences and ordered paragraphs outperform keyword soup.

### Internal Stitching Formula (our agent system)

```
[SHOT TYPE + CAMERA]  →  [LIGHTING]  →  [MODEL]  →  [PRODUCT INTERACTION]  →
[SETTING]  →  [ATMOSPHERE/MOOD]  →  [STYLE REFERENCE]  →  [TECHNICAL QUALITY]
```

This is lighting-first ordering — proven for photoreal commercial work. Use Google's 5-element framework when the deliverable is editorial/illustration; use the internal stitching formula when it's photography.

### Example (Pro 5-element)

> "Photograph a striking fashion model in a tailored brown silk dress, posing with a confident contrapposto stance against a seamless deep cherry red studio backdrop, medium-full shot, center-framed, fashion magazine style editorial, shot on medium-format analog film with pronounced grain and high saturation, cinematic three-point softbox lighting."

---

## Five Best Practices

1. **Be specific.** Concrete details on subject, lighting, composition. Replace "blue dress" with "navy blue tweed knee-length dress, structured shoulders". Replace "good lighting" with "warm three-point softbox at 5500K, key from camera-left".

2. **Positive framing.** Tell Gemini what you DO want, not what you don't.
   - ❌ `no cars on the street`
   - ✅ `an empty street`

   Negative phrasing confuses the model and sometimes inserts the negated element.

3. **Control the camera.** Use photographic and cinematic vocabulary: `low angle`, `aerial view`, `tilt-shift`, `wide-angle 24mm`, `f/1.8 shallow depth of field`, `Dutch tilt`. The richer the camera vocabulary, the more cinematic the output.

4. **Iterate conversationally.** Refine with follow-up turns. Gemini's chat mode preserves context across edits — don't restart from scratch when you want a small change.

5. **Start with a strong verb.** `Generate`, `Render`, `Photograph`, `Edit`, `Replace`, `Add`, `Remove`. Tells Gemini whether you're creating, editing, or transforming.

---

## Five Prompting Frameworks

### 1. Image Generation

**Text-to-image (no references)**

```
[Subject] + [Action] + [Location/Context] + [Composition] + [Style]
```

**Multimodal generation (with references)**

```
[Reference images] + [Relationship instruction] + [New scenario]
```

> Example: *"Using the attached napkin sketch as the structure and the attached fabric sample as the texture, transform this into a high-fidelity 3D armchair render. Place it in a sun-drenched, minimalist living room."*

### 2. Image Editing

**Conversational edit (no new references)** — semantic mask. Define the mask in text, leave everything else untouched.

> Example: *"Remove the man from the photo. Keep the rest of the scene unchanged."*

**Composition / style transfer (with new reference)**

> Example: *"Recreate this city street photo in a Van Gogh post-impressionist style with thick textured brushstrokes."*

### 3. Real-Time Web Search

```
[Source/Search request] + [Analytical task] + [Visual translation]
```

> Example: *"Search for the current weather and date in San Francisco. If it's raining, render the scene as grey and rainy. Visualize this as a miniature city-in-a-cup concept embedded within a realistic modern smartphone UI."*

### 4. Text Rendering & Localization

See full text rules below.

> Example: *"...render three lines of text on the poster: 'GLOW' in Brush Script, '10% OFF' in Impact bold, 'Your First Order' in Century Gothic 12px. Then translate the entire poster into Korean and Arabic."*

### 5. Prompting Like a Creative Director

Stack four lenses on every shot: lighting → camera → color grading → materiality. (Detailed below.)

---

## Text Rendering Rules

Nano Banana Pro renders legible in-image text. Use the rules or you lose them.

1. **Quote desired text exactly.**
   - ✅ `render the headline "GLOW UP" centered`
   - ❌ `render a headline saying glow up`

2. **Keep text under 25 characters per element** for best accuracy (Imagen 4 finding applies to Gemini models).

3. **Specify fonts.** Name family + weight + size where it matters.
   - `Bold sans-serif, white`
   - `Brush Script, gold metallic`
   - `Century Gothic 12px`

4. **Translate / localize.** Ask Gemini to render in another language directly.
   - `Render the menu in Japanese with proper typography`
   - `Translate this poster into Arabic, right-to-left layout`

5. **Text-first hack** for tricky compositions: generate the text concepts in chat first, then ask for the image with that text.

6. **Brand-mark accuracy.** For logos with specific spelling/proportions, attach a brand asset as a reference image and write `match the logo from Image N exactly, preserving glyph shapes and clearspace`.

7. **Step-by-step for complex scenes (6+ text layers).** Generate base scene first, add text layers in subsequent turns.

8. **Limitations to expect.** Small text (<2% of frame), highly stylized scripts, and dense paragraphs may still render with errors — verify before shipping.

**Typography Control (Advanced):** nano-banana-creator/references/gemini-typography-control.md

---

## Multi-Reference & Image Blending

Nano Banana accepts up to **14 reference images** per call.

### Labeling Pattern

```
Image 1: [role] — [what to extract]
Image 2: [role] — [what to extract]
...

Instruction: [how to combine, what to preserve, what to change]
```

> Example:
> *"Image 1: structure reference (napkin sketch).
> Image 2: texture reference (fabric swatch).
> Image 3: lighting reference (golden-hour interior).
> Render a 3D armchair using Image 1's silhouette, Image 2's upholstery texture, and Image 3's warm directional light."*

### Image Blending for Character Consistency

For carousels or campaigns with the same character across frames, blend up to 14 reference images of the same subject. Gemini synthesizes a stable identity from the union.

### Brand Consistency

Apply logos and patterns to 3D surfaces while preserving texture and lighting:

> *"Image 1: the brand logo. Image 2: a coffee mug. Apply the logo from Image 1 to the curved ceramic surface of the mug in Image 2 — match the mug's existing shadows, glaze reflectivity, and depth of field."*

---

## Lighting, Camera, Grading, Material

### Design Your Lighting

| Mood | Vocabulary |
|---|---|
| Studio neutral | `three-point softbox setup, 5500K, low contrast ratio` |
| Dramatic | `Chiaroscuro lighting, harsh high-contrast, single hard key from camera-right` |
| Editorial | `Golden hour backlighting, long shadows, warm rim light` |
| Cinematic | `Practical lights only, mixed tungsten + neon, motivated by source` |
| Beauty | `Clamshell lighting, large softbox above + reflector below, even falloff` |

### Camera, Lens & Focus

| Effect | Hardware vocabulary |
|---|---|
| Immersive / fisheye | `GoPro` |
| Authentic color | `Fujifilm` |
| Nostalgic flash | `disposable camera` |
| Editorial portrait | `Hasselblad X2D 100C, 85mm f/1.4` |
| Commercial product | `Phase One IQ4, 80mm f/8` |
| Street | `Sony A7R V, 50mm f/1.2` |
| Macro detail | `macro lens, 100mm` |
| Establishing wide | `wide-angle lens, 24mm` |

### Color Grading & Film Stock

- Nostalgic: `1980s color film, slightly grainy, warm fade`
- Modern moody: `cinematic color grading with muted teal tones, lifted blacks`
- Documentary: `flat color profile, neutral white balance`
- High fashion: `high saturation, deep blacks, oversaturated reds`

### Materiality & Texture

Replace generic nouns with named materials.

| Generic | Specific |
|---|---|
| `suit jacket` | `navy blue tweed with herringbone weave` |
| `armor` | `ornate elven plate armor etched with silver leaf patterns` |
| `surface` | `brushed aluminum with fingerprint smudges` |
| `glass` | `frosted glass with subtle waterspots` |
| `wood` | `weathered reclaimed oak with visible grain and chipped paint` |

### Color Temperature Reference

| Temp (K) | Quality | Best for |
|---|---|---|
| 2700–3200K | Warm golden / amber | Sunset, candlelight, golden hour |
| 3500–4000K | Warm white | Lifestyle interior, cozy domestic |
| 5000–5600K | Daylight neutral | Studio, overcast outdoor |
| 6000–7000K | Cool blue-white | Morning light, blue hour, tech |
| 8000K+ | Deep blue / cyan | Dawn, twilight, underwater |

### Skin Description Formula

**For full 3-part skin formula with all Fitzpatrick scale examples, see:**
`nano-banana-creator/agents/agent-2-human-model-creator/SKILL.md` → Skin Description Formula

**Quick reference:**
```
[TONE] + [TEXTURE QUALITY] + [LIGHT INTERACTION]
```

Always include one anti-plastic-skin phrase (see Agent 2 for full list).

---

## Resolution & Aspect Ratios

Nano Banana exposes resolution as **tiers** (not arbitrary pixel sizes like OpenAI).

### Resolution Tiers

| Tier | Approximate pixels | Use |
|---|---|---|
| 0.5K | ~512px edge (Flash only) | Iteration, drafts |
| 1K | ~1024px edge | Standard production |
| 2K | ~2048px edge | High-quality web/social |
| 4K | ~3840px edge | Print, hero banners, retina |

**Provider caps — important for routing:**

| Route | Supported tiers |
|---|---|
| Direct Google API (`/generate` with Gemini provider) | 0.5K (Flash only), 1K, 2K, 4K |
| **Pudding Gemini proxy** (`/api/pudding/generate`) | **1K and 2K ONLY** — 0.5K and 4K are not available on Pudding; the resolver floors to 1K on unknown labels |

If the shoot targets a print-ready deliverable (4K) and the provider is Pudding-Gemini, either switch to direct Google API or accept 2K and upscale post-render.

### Aspect Ratios

**Both Pro and 2:** 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
**Nano Banana 2 only (extreme):** 1:4, 4:1, 1:8, 8:1

Pick aspect ratio per platform:

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

## API Parameters

### Generation Config

```javascript
{
  responseModalities: ["TEXT", "IMAGE"],   // ALWAYS include both
  temperature: 1.0,                         // 0.0–2.0
  topP: 0.97,                               // 0.0–1.0
  topK: 40,                                 // 1–100
  candidateCount: 2,                        // 1–4
  seed: 42,                                 // integer; same seed → same image
  maxOutputTokens: 1000,
  
  // Gemini 3 models only — reasoning before generation
  thinking_level: "High",                   // "Minimal" or "High"
  include_thoughts: true                    // Include reasoning in response
}
```

### Parameter Tuning Guide

| Goal | temperature | top_p | top_k | seed | thinking_level |
|---|---|---|---|---|---|
| Exact product accuracy | 0.3–0.5 | 0.90 | 20–30 | Fixed (e.g. 42) | High |
| Text accuracy (5+ layers) | 0.5–0.7 | 0.90 | 25–32 | Fixed | High |
| Lifestyle / editorial | 0.9–1.1 | 0.97 | 40 | Fixed, then vary ±5 | Minimal |
| Maximum creativity | 1.2–1.5 | 0.99 | 60–80 | Try multiple seeds | Minimal |
| Consistent series | 0.7 | 0.93 | 32 | Same seed across all | High |
| Subtle variation series | 0.8 | 0.95 | 40 | Seed+1, +2, +3 | Minimal |

### Tools

```javascript
tools: [{ googleSearch: {} }]              // Real-time web search
tools: [{ imageSearch: {} }]               // Visual context search (3.1 Flash only, cannot search people)
```

**Google Search:** Use for real weather, current events, location accuracy, trend-aware styling.

**Image Search (NEW — 3.1 Flash only):** Model searches web for relevant images, uses them as visual reference during generation. Cannot search people. Example: "Generate poster with Eiffel Tower in background" (searches for Eiffel Tower images).

### Multi-Turn Consistency (Gemini 3)

For iterative edits with preserved reasoning context:

```javascript
contents: [
  {
    role: "model",
    parts: [{ thought_signature: previousThoughtSignature }]  // From previous response
  },
  {
    role: "user",
    parts: [{ text: "Now adjust the headline size to 60pt" }]
  }
]
```

---

## Iteration Workflow

1. **Draft at 0.5K or 1K** with `temperature: 1.0`, `seed: 42` — cheap, fast.
2. **Refine conversationally** in chat — add follow-up turns to adjust lighting, pose, framing without regenerating from scratch.
3. **Lock the seed** once composition is right.
4. **Re-render at 2K or 4K** for final.
5. **Seed variants** — explore +1/+2/+7/+13/+58 for pose/light/atmosphere variation while keeping the same prompt.

### Step-by-Step Construction (Complex Scenes)

For ultra-complex scenes (6+ text layers, multiple subjects, intricate composition):

**Turn 1:** Generate base scene without text
**Turn 2:** Add primary text layers
**Turn 3:** Add secondary text layers

**Why:** Gemini processes each instruction sequentially, reducing text rendering errors in complex scenes.

**Multi-turn consistency:** Use `thought_signature` from previous response to preserve reasoning context across edits (Gemini 3 only).

---

## Real-Time Web Search Framework

Pattern:

```
[Source/Search request] + [Analytical task] + [Visual translation]
```

Use when the visual depends on real-world facts:

- Current weather / season at a location
- Live event details (sports score, news headline)
- Trend-aware fashion / interior styling
- Real iconic landmarks with up-to-date appearance

Activate via:

```javascript
tools: [{ googleSearch: {} }]
```

Then prompt the model to "search for X" inside the prompt — the model invokes the tool, receives results, and integrates them into the image specification before rendering.

---

## Watermarking & Provenance

Every Nano Banana output carries:

- **C2PA** — cryptographic content credentials (provenance manifest in metadata).
- **SynthID** — invisible AI-watermark embedded in pixels, detectable even after compression / minor edits.

You cannot opt out. Plan accordingly:
- Don't strip metadata if downstream verification matters.
- Watermarks survive resize, screenshot, and most edits.
- For workflows requiring "untraceable" output, Nano Banana is not the right tool.

---

## Failure Modes & Fixes

| Symptom | Fix |
|---|---|
| Plastic / airbrushed skin | Add `natural skin texture with subtle micro-contrast`, name the Fitzpatrick type, add the 3-part skin formula |
| Generic "AI face" | Use research-backed pose + expression vocabulary; add specific facial features (jawline, cheekbones, eye color/shape) |
| Default light skin (Midjourney bias) | Explicit Fitzpatrick reference + tone + undertone every time |
| Text illegible / wrong characters | Quote text exactly, specify font + weight + size, retry with Pro model, use text-first hack |
| Identity drifts across edits | Keep seed fixed, restate preserve list every turn, use multimodal blending with the same character ref |
| Negative phrasing got inverted | Rewrite as positive: `no cars` → `empty street` |
| Lifeless / "stock photo" feel | Use `candid, unposed, natural micro-expression`, drop `professional / commercial / studio` quality stack |
| Compositing looks pasted | Name the lighting on EACH layer + on the composite: `match Image 1's golden hour light direction` |
| Slow render | Drop to Nano Banana 2 (Flash) for iteration, save Pro for finals |
| Real-world detail wrong | Enable `googleSearch` tool, follow Web Search Framework |

---

## Cost & Performance

Per-call pricing scales with:
- Resolution tier (0.5K → 4K)
- Number of candidate variants (`candidateCount: 1–4`)
- Reference image count (each ref consumes input tokens)
- Tool use (web search adds latency + token cost)

### Rules of Thumb

1. Iterate at 0.5K / 1K + Flash.
2. Multi-ref blending at Pro stacks token costs — budget per ref.
3. Carousel of N slides with same seed = N separate calls; price linear.

### Performance

- Flash: ~5–15s at 1K, ~15–30s at 4K
- Pro: ~15–40s at 1K, ~40–90s at 4K
- Web search adds 2–5s
- Streaming mode available — partial frames arrive progressively

---

## Limitations

1. Knowledge cutoff January 2025 — for newer facts use `googleSearch` tool.
2. Small text (<2% frame), highly stylized scripts, and dense paragraphs may render with errors.
3. Character consistency across edits is improved but not perfect — always blend multiple refs of the same subject for campaigns.
4. C2PA + SynthID watermarks always on — not removable.
5. Translation grammar / cultural nuance imperfect for lesser-resourced languages.
6. Complex multi-edit chains can accumulate artifacts — restart from a clean base when drift compounds.
7. Max 14 reference images per call.
8. Subject to Google rate limits — your tier determines throughput.

---

## Quick Reference Checklist

Before hitting generate, verify:

- [ ] **Strong verb opening** (Generate / Render / Photograph / Edit)
- [ ] **5-element structure** present (Subject / Action / Location / Composition / Style) OR internal stitching formula (lighting-first)
- [ ] **Positive framing** — no negation language
- [ ] **Specific camera vocab** — lens / angle / depth of field
- [ ] **Specific lighting** — direction, source, color temperature
- [ ] **Materiality named** — not "fabric" but "navy tweed"
- [ ] **Skin formula** — Tone + Texture + Light interaction
- [ ] **Anti-plastic phrase** present for human subjects
- [ ] **Text quoted exactly** with font + weight + position
- [ ] **References labeled** `Image 1: <role>`, `Image 2: <role>` if multimodal
- [ ] **Aspect ratio** matches platform
- [ ] **Resolution tier** matches deliverable (0.5K iterate → 4K final)
- [ ] **Seed strategy** — fixed for consistency, varied for exploration
- [ ] **Web search** enabled if real-world facts matter

---

## Additional Resources

- **Google Cloud guide:** https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
- **Google Blog Pro tips:** https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/
- **Typography Control (Advanced):** `nano-banana-creator/references/gemini-typography-control.md`
- **Internal references:** `nano-banana-creator/references/agent-intelligence.md`, `prompt-patterns.md`, `api-reference.md`
- **OpenAI parallel:** `docs/prompting-playbook.md`

---

**Last Updated:** 2026-05-02
**Version:** 1.0
