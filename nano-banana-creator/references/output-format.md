# Universal Output Format

This file is the canonical spec for how the Director delivers a finished prompt package. There is **one** output format. It is tool-agnostic — the user pastes the result wherever they want (node canvas, Google AI Studio web UI, raw API call, another chat).

---

## Block Order (mandatory)

The Director outputs the following blocks, in this exact order, with the exact emoji headers shown:

```
📋 Creative Brief Summary
🧍 Model Block
🏖️ Setting Block
📦 Product Block
🖼️ Reference Image Manifest          ← only if Gate 2 had ANY ref checked
🎬 Master Prompt
⚙️ API Configuration
🌱 Seed Exploration Guide             ← Gemini only; OpenAI shows variation strategy
✍️ Copy Block                         ← only if Agent 7 was invoked
```

Skip the `🖼️ Reference Image Manifest` block entirely if Gate 2 returned "None — text only, pure generation".
Skip the `✍️ Copy Block` unless the user asked for paired captions.
For OpenAI runs, replace `🌱 Seed Exploration Guide` content with a variation-strategy paragraph (OpenAI's gpt-image-2 doesn't expose seeds — variations come from re-running with prompt deltas).

---

## Master Prompt — line 1 rule

Every Master Prompt opens with an `[API:]` literal on line 1. This is universal — regardless of where the user will paste it, the line is always there.

Gemini:
```
[API:provider=gemini,model=gemini-3.1-flash-image-preview,temp=1.0,topP=0.97,topK=40,seed=42]
```

OpenAI:
```
[API:provider=openai,model=gpt-image-2,size=1024x1024,quality=high]
```

The body of the Master Prompt follows on line 2 onward, with no indentation. Every line starts at column 1.

---

## Reference Image Manifest

Emit this block only when Gate 2 (Reference Inventory) returned at least one checked item. Format:

```
🖼️ Reference Image Manifest
   Image 1: <role> — <preserve list>
   Image 2: <role> — <preserve list>
   ...
   Instruction: <how the prompt body should consume these refs>
```

### Ordering rule (strict)

1. Product photo(s) — most important product first if multiple
2. Model composite or face reference
3. Setting plate (already-generated background)
4. Style / visual reference (mood board, competitor ad, magazine spread)

Source: `references/agent-intelligence.md:743–797` and `references/gemini-prompting.md:73–80`.

### Preserve list

Per image, list the visual attributes that must survive into the generation. Examples:
- Product: label legibility, color, material reflectivity, geometry
- Model: face structure, skin tone, hair length & color
- Setting: light direction, time of day, depth layers
- Style: color palette, contrast register, grain / softness

### Instruction line

A short directive telling the model how the body of the prompt consumes the references. Two examples:

**Gemini example:**
```
🖼️ Reference Image Manifest
   Image 1: product (iSupply Pro 2 earbuds) — preserve label "iSupply", glossy white finish, stem geometry
   Image 2: model (Maya v1) — preserve face structure, golden-beige skin, shoulder-length dark hair
   Image 3: setting plate — preserve golden-hour light direction (camera-left, 15° above horizon), turquoise water depth
   Instruction: Place Image 2's subject into Image 3's environment, holding the product from Image 1 in her right hand. Match Image 3's lighting onto Image 2. Do not redescribe the model's face or wardrobe in the body — Image 2 defines them.
```

**OpenAI example:**
```
🖼️ Reference Image Manifest
   Image 1: product (matte ceramic skincare bottle) — preserve label typography, matte finish, bottle proportions
   Image 2: style ref (Vogue editorial spread) — preserve cool muted palette, soft contrast, grain register
   Instruction: Image 1 supplies the exact product. Image 2 supplies the aesthetic register only — do not copy its composition. The body describes the new scene.
```

---

## What is NOT auto-emitted anymore

- ❌ "PASTE INTO ModelCreationNode" / "PASTE INTO SettingNode" / "PASTE INTO PromptNode" headers
- ❌ Canvas edge diagrams
- ❌ JS / Python code snippets (available on request via Agent 7-style add-on, not by default)
- ❌ AI Studio sidebar parameter list (the `[API:]` line 1 already documents the parameters — the user reads it and types into whatever UI they're in)
- ❌ Mode-specific branches of any kind

---

## Seed / Variation strategy

**Gemini** — emit the Seed Exploration Guide table:

| Seed offset | Typical change |
|---|---|
| Base | Anchor reference shot |
| +1 | Minor pose / expression shift |
| +7 | Background depth, sky variation |
| +13 | Lighting angle shift |
| +35 | Moderate composition change |
| +58 | Strong alternative interpretation |

**OpenAI (gpt-image-2)** — no seed control. Emit a short paragraph:

> Variation strategy: OpenAI gpt-image-2 doesn't expose a seed. To explore variants, re-run the same Master Prompt N times for stochastic variation, or change one descriptive lever per re-run (lighting direction, model gesture, background depth) to produce controlled variants.

---

## Carousel Output

For a carousel, repeat the Master Prompt block per slide:

```
🎬 Master Prompt — Slide 1 [PLATE: PRIMARY]
[API:provider=...]
<body>

🎬 Master Prompt — Slide 2 [PLATE: OVERRIDE — inline setting included]
[API:provider=...]
<body>
```

The Reference Image Manifest is shared across slides (emit once, before slide 1).
Plate flags carry over from the Camera Angle Audit unchanged: `[PLATE: PRIMARY]`, `[PLATE: OVERRIDE — inline setting included]`, `[PLATE: NEW — second setting plate required]`.

---

## NO INDENT RULE

Master Prompts are output as a single continuous block with NO indentation, NO leading spaces, NO bullet points, NO nested structure. Every line starts at column 1. This is critical for copy-paste portability across canvases, web UIs, and raw API calls.
