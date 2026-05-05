# GPT-Image-2 Prompting Playbook

Distilled from OpenAI's cookbook, fal.ai's guide, and production testing. Treat as defaults, not dogma.

---

## Table of Contents

1. [Model Overview](#model-overview)
2. [Core Prompt Structure](#core-prompt-structure)
3. [Text Rendering Rules](#text-rendering-rules)
4. [Multi-Reference Labeling](#multi-reference-labeling)
5. [Preserve-and-Change Language](#preserve-and-change-language)
6. [Lighting and Materials](#lighting-and-materials)
7. [Quality Levers](#quality-levers)
8. [Resolution and Aspect Ratios](#resolution-and-aspect-ratios)
9. [API Parameters](#api-parameters)
10. [Use Case Recipes](#use-case-recipes)
11. [Iteration Workflow](#iteration-workflow)
12. [Failure Modes and Fixes](#failure-modes-and-fixes)
13. [Cost and Performance](#cost-and-performance)
14. [Limitations](#limitations)

---

## Model Overview

### Available Models

| Model | Best For | Notes |
|---|---|---|
| `gpt-image-2` | Default for new production builds | Most capable, flexible sizing, best text rendering |
| `gpt-image-1.5` | Backward-compatible migration target | Legacy support |
| `gpt-image-1` | Legacy only | Deprecated |
| `gpt-image-1-mini` | High-volume, cost-sensitive batches | Lower quality, faster/cheaper |

### GPT-Image-2 Strengths

- High-fidelity photorealism with natural lighting
- Flexible quality-latency tradeoffs (low/medium/high)
- Strong facial and identity preservation
- Reliable text rendering in images
- Complex structured visuals (infographics, diagrams)
- Precise style control and transfer
- Transparent background support (PNG/WebP)
- Up to 16 reference images per edit call
- Resolution up to 4K (3840px max edge)

---

## Core Prompt Structure

**Five-slot template** (order matters):

```
Scene / background → Subject → Key details → Typography → Constraints
```

### Why This Order?

gpt-image-2 processes language sequentially. **The first 10 words carry the most visual weight.** Front-load what matters.

### Example

**Bad:**
> "A stunning, epic masterpiece of a product shot with amazing lighting"

**Good:**
> "White seamless studio background. Brushed aluminum water bottle, 45-degree angle. Soft key light from upper left, subtle rim light. Professional product photography, sharp focus. No text, no extra objects."

### Breakdown

1. **Scene**: "White seamless studio background"
2. **Subject**: "Brushed aluminum water bottle, 45-degree angle"
3. **Key details**: "Soft key light from upper left, subtle rim light"
4. **Typography**: (none in this case)
5. **Constraints**: "No text, no extra objects"

---

## Text Rendering Rules

This is where gpt-image-2 earns its premium. Use the rules or lose them.

### 1. Always Quote Exact Text

```
✅ 'a poster reading "SHIPPED"'
❌ 'a poster saying shipped'
```

Unquoted text gets paraphrased or hallucinated.

### 2. Specify Placement and Typography

Font style (serif / sans / mono), size (large / medium / small), weight, color, position.

```
"Bold serif headline 'LAUNCH DAY', centered, 40% of frame height, black on cream background"
```

### 3. Demand Verbatim Rendering

Add explicit constraints:

```
"no extra text, no duplicate letters, no hallucinated words"
```

Models love to sprinkle filler. Shut it down.

### 4. Spell Out Tricky Words Letter-by-Letter

For brand names or non-dictionary terms:

```
the word "ACME" (A-C-M-E)
```

### 5. Use `--quality high` for Small Text

`medium` blurs fine type. Dense information panels, multi-font layouts, and small text require `high`.

### 6. Put Every Piece of Text in Its Own Quoted Phrase

If you have multiple copy blocks:

```
"Headline 'LAUNCH DAY', subhead 'May 1, 2026', CTA button 'Get Started'"
```

Don't run them together.

---

## Multi-Reference Labeling

When using the `/v1/images/edits` endpoint with 2+ references, **label every image by role** and reference the labels in your instruction.

### Pattern

```
Image 1: base scene to preserve
Image 2: jacket to composite onto the subject in Image 1
Image 3: boots to composite onto the subject in Image 1

Instruction: "Apply Image 2 and Image 3 to the subject in Image 1. Keep Image 1's lighting, background, and camera angle unchanged."
```

### Why?

Without labels, the model guesses which reference is canonical. With labels, it follows instructions.

---

## Preserve-and-Change Language

For surgical edits, **state both sides explicitly**. The model drifts otherwise.

### Pattern

**Change only:**
```
"Replace the jacket with the one from Image 2."
```

**Keep:**
```
"Keep the face, hair, pose, background, lighting, and color temperature unchanged."
```

### Critical Rule

**Repeat the preserve list on every iteration.** Drift compounds across edits.

---

## Lighting and Materials

Lighting separates flat images from cinematic ones. Be specific.

### Lighting Examples

```
"Fluorescent ceiling light mixed with neon signage glow"
"Dramatic orange-red gradient backlight, subject in silhouette"
"Golden hour natural light, low angle, warm shadows"
"Soft key light from upper left, subtle rim light, studio setup"
```

### Materials

Name textures, surfaces, reflectivity.

```
"Matte cream paper, no gloss"
"Brushed aluminum with fingerprint smudges"
"Chipped paint on weathered wood"
"Overcast daylight on wet asphalt"
```

Generic prompts produce generic images.

---

## Quality Levers

Add these **ONLY when the base prompt underdelivers**. Stacking them turns output mushy.

### High-Leverage Keywords

- **`photorealism`** — single highest-leverage word for lifelike output. Drop it into any prompt aiming for a real-photo look and realism jumps exponentially. **Skip for illustration, poster, or editorial-graphic work.**
- **`film grain / 35mm`** — analog warmth
- **`macro detail / shallow depth of field`** — product shots
- **`candid, unposed`** — defeats the default polished-studio look
- **`hand-drawn, pencil texture`** — editorial illustration

### Anti-Slop Rules

Replace vague praise with visual facts:

| ❌ Vague | ✅ Visual Fact |
|---|---|
| "stunning" | "overcast daylight, brushed aluminum" |
| "epic masterpiece" | "50mm lens feel, shallow depth of field" |
| "minimalist luxury" | "white seamless background, centered composition, soft shadows" |

---

## Resolution and Aspect Ratios

gpt-image-2 accepts any WxH that satisfies **four constraints** (per OpenAI's official docs):

1. **Max edge ≤ 3840px** (true 4K long edge)
2. **Both edges are multiples of 16**
3. **Long-to-short ratio ≤ 3:1**
4. **Total pixels between 655,360 and 8,294,400** (the hard cap — this is the one people miss)

### Common Sizes

| Ratio | Use Case | Standard | 4K / Hi-Res |
|---|---|---|---|
| 1:1 | Instagram post, avatar, square poster | 1024×1024 | 2880×2880 (at cap) |
| 2:3 | LinkedIn portrait, magazine cover | 1024×1536 | 2048×3072 |
| 3:2 | Editorial landscape, hero banner | 1536×1024 | 3072×2048 |
| 16:9 | YouTube thumbnail, widescreen hero | — | 3840×2160 (4K, at cap) |
| 9:16 | Reels, TikTok, Stories, vertical mobile | — | 2160×3840 (4K, at cap) |
| 4:3 | Classic photo landscape | 1024×768 | 3200×2400 |
| 3:4 | Classic photo portrait | 768×1024 | 2400×3200 |
| 2:1 | Wide banner, ticket-style layout | 1536×768 | 3072×1536 |
| 3:1 | Max-allowed ultrawide (hero strip, OG header) | — | 3840×1280 |

### Notes

- **1920×1080 does NOT work** — 1080 is not a multiple of 16. Use **3840×2160** for exact 16:9 at 4K, or **1920×1088** for close-to-16:9 at 2K.
- **`auto`** lets the model choose a shape that matches your prompt. Useful early. Lock a specific size once composition is committed.
- **Cost scales with size × quality.** 4K at `--quality high` is the most expensive combination.

### Workflow

1. Iterate at **1024px** on `--quality low` (cheap, fast)
2. Commit the composition
3. Re-render winning prompt at **4K** on `--quality high` for final deliverable

High-DPI screens and print love 4K. 3840px on the long edge maps cleanly to retina displays and gives headroom for poster print at 300 DPI up to ~13 inches.

---

## API Parameters

### `/v1/images/generations` (text-to-image)

**Body (JSON):**

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "quality": "high",
  "size": "1024x1024",
  "output_format": "png",
  "background": "transparent",
  "n": 1,
  "stream": false
}
```

**Key Parameters:**

- `prompt` (required): up to 32,000 chars for GPT image models
- `model`: `gpt-image-2` | `gpt-image-1.5` | `gpt-image-1` | `gpt-image-1-mini`
- `quality`: `low` | `medium` | `high` | `auto` (default: `auto`)
- `size`: `auto` | `1024x1024` | `1536x1024` | `1024x1536` (or custom WxH meeting constraints)
- `output_format`: `png` | `jpeg` | `webp`
- `background`: `transparent` | `opaque` | `auto` (PNG/WebP only for transparent)
- `n`: 1-10 (number of images to generate)
- `stream`: `true` | `false` (streaming mode)
- `partial_images`: 0-3 (streaming only)
- `output_compression`: 0-100 (JPEG/WebP only)
- `moderation`: `low` | `auto`

**Returns:** `data[0].b64_json` (base64-encoded image)

### `/v1/images/edits` (with reference images)

Supports up to **16 images** for GPT image models.

**Body (JSON):**

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "images": [
    { "image_url": "https://example.com/img.png" },
    { "image_url": "data:image/png;base64,..." },
    { "file_id": "file-abc123" }
  ],
  "quality": "high",
  "size": "1024x1024",
  "output_format": "png",
  "background": "transparent",
  "input_fidelity": "high",
  "n": 1
}
```

**Key Parameters:**

- `images` (required): array of `{ file_id?, image_url? }` (URL or base64 data URL)
- `prompt` (required): text description of desired edit
- `input_fidelity`: `high` | `low` (controls fidelity to original input images)
- `mask`: `{ file_id?, image_url? }` (optional mask image)
- All other params same as `/v1/images/generations`

**Returns:** `data[0].b64_json`

---

## Use Case Recipes

### 1. Product Photography

```
White seamless studio background. [Product name], [angle]. Soft key light from upper left, subtle rim light. Professional product photography, sharp focus, high resolution, commercial quality. No text, no extra objects.
```

**Parameters:**
- `quality: "high"`
- `size: "1024x1024"` or `"1536x1024"`
- `output_format: "png"`
- `background: "transparent"`

### 2. Lifestyle Imagery

```
[Scene setting]. [Human subject with specific attributes], [action/pose]. [Environmental details and props]. [Mood and color palette]. Editorial photography, candid, natural lighting, 50mm lens feel.
```

**Parameters:**
- `quality: "high"`
- `size: "1536x1024"` or `"2048x1536"`
- `output_format: "jpeg"`

### 3. Infographics

```
Clean infographic layout. Headline "[EXACT TEXT]" in bold sans-serif, top center. Three columns below: "[Column 1 Title]", "[Column 2 Title]", "[Column 3 Title]". Each column has icon above text. Minimal color palette: [colors]. No extra text, no duplicate letters.
```

**Parameters:**
- `quality: "high"`
- `size: "1536x1024"` or `"1920x1088"`
- `output_format: "png"`

### 4. UI Mockups

```
Mobile app screen mockup. [App name] interface. Top navigation bar with "[Title]". Main content area shows [description]. Bottom tab bar with icons for [tabs]. Modern, clean design. iOS style. No extra text.
```

**Parameters:**
- `quality: "high"`
- `size: "1024x1536"` (9:16 portrait)
- `output_format: "png"`

### 5. Style Transfer (Edit Mode)

```
Image 1: base photo to preserve
Image 2: style reference

Apply the artistic style from Image 2 to Image 1. Keep Image 1's composition, subject, pose, and framing unchanged. Match Image 2's color palette, brushstroke texture, and lighting mood.
```

**Parameters:**
- `quality: "high"`
- `input_fidelity: "high"`

### 6. Virtual Try-On (Edit Mode)

```
Image 1: person photo to preserve
Image 2: clothing item to apply

Apply the clothing from Image 2 to the person in Image 1. Keep Image 1's face, hair, pose, background, lighting, and camera angle unchanged. Ensure clothing fits naturally with realistic folds and shadows.
```

**Parameters:**
- `quality: "high"`
- `input_fidelity: "high"`

---

## Iteration Workflow

### Standard Workflow

1. **Iterate at 1024px + `quality: "low"`** (cheap, fast)
   - Test composition, framing, subject placement
   - Refine prompt language
   - Experiment with lighting and materials

2. **Commit composition**
   - Lock down the winning prompt
   - Verify all text is correct
   - Confirm preserve/change lists for edits

3. **Re-render at 4K + `quality: "high"`** for final deliverable
   - Use for production assets
   - Print-ready output
   - High-DPI screens

### Edit Workflow

1. **Start with base image**
2. **State change + preserve list explicitly**
3. **Generate first edit**
4. **If drift occurs, restate preserve list and iterate**
5. **Never skip the preserve list** — drift compounds

---

## Failure Modes and Fixes

| Symptom | Fix |
|---|---|
| **Text illegible or wrong characters** | Use `quality: "high"`, quote the text, spell tricky words letter-by-letter |
| **Identity drifts across edits** | Restate the preserve list every iteration |
| **Unwanted creative reinterpretation** | Add "no new elements", "preserve layout and perspective", lock specifics |
| **Overpolished / stock-photo feel** | Use "candid, unposed, natural light" instead of "studio, cinematic" |
| **Duplicate / extra words appear** | Add "no extra text, no duplicate letters, single headline only" |
| **Compositing looks pasted-on** | Name the lighting and shadows explicitly: "Match lighting from Image 1" |
| **Slow generation (>60s)** | Drop to `quality: "medium"`, or reduce reference image count |
| **Resolution fails** | Verify both edges are multiples of 16, ratio ≤ 3:1, total pixels ≤ 8.29M |

---

## Cost and Performance

### Cost Factors

Per-call pricing is a function of:
- **Size** (resolution)
- **Quality** (`low` / `medium` / `high`)
- **Input image tokens** (for multi-reference composition)

### Rules of Thumb

1. **Text-to-image at `quality: "low"`** is cheap enough to iterate freely.
2. **Multi-reference edits at `quality: "high"`** stack token costs fast. Every reference is processed at high fidelity. Budget accordingly.

### Performance

- **Text-to-image**: ~10-30s at `quality: "low"`, ~30-60s at `quality: "high"`
- **Multi-reference edits**: ~30-120s depending on reference count and quality
- **Streaming mode**: Partial images arrive progressively (set `partial_images: 1-3`)

---

## Limitations

1. **No transparent backgrounds on JPEG** — use PNG or WebP for `background: "transparent"`
2. **Complex prompts can take up to 2 minutes** — plan for it
3. **Org verification required** (one-time, ~2 minutes + propagation)
4. **Subject to OpenAI rate limits** — your tier determines throughput
5. **Max 16 reference images per edit call**
6. **Max prompt length: 32,000 chars** (GPT image models)

---

## Quick Reference: Prompt Checklist

Before hitting generate, verify:

- [ ] **Structure**: Scene → Subject → Details → Typography → Constraints
- [ ] **Text**: Quoted exactly, typography specified, "no extra text" constraint added
- [ ] **Lighting**: Named explicitly (not "good lighting")
- [ ] **Materials**: Specific textures and surfaces (not "nice materials")
- [ ] **Constraints**: What must NOT change or appear
- [ ] **Quality**: `low` for iteration, `high` for final
- [ ] **Resolution**: Edges multiples of 16, ratio ≤ 3:1, total pixels ≤ 8.29M
- [ ] **Format**: PNG for transparency, JPEG for photos, WebP for web
- [ ] **Edits**: Preserve list stated explicitly, labels for multi-reference

---

## Additional Resources

- **OpenAI API Reference**: `docs/openai docs`
- **OpenAI Cookbook**: https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- **fal.ai Guide**: https://fal.ai/learn/tools/prompting-gpt-image-2
- **Typography Control (Advanced)**: `docs/openai-typography-control.md`
- **Recipe Templates**: `recipes/` folder (infographic.md, meta-ad.md, viral-linkedin.md)
- **Nano Banana sister playbook**: `docs/nano-banana-prompting-playbook.md`
- **Director before/after (OpenAI)**: `docs/director-before-after-playbook.md`
- **Director before/after (Nano Banana)**: `docs/nano-banana-before-after-playbook.md`

---

**Last Updated**: 2026-05-01
**Version**: 1.0
