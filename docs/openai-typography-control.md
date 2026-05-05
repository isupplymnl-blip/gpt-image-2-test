# OpenAI GPT-Image-2 Typography Control Reference

Advanced prompting patterns for complex multi-layer typography in GPT-Image-2. Based on production testing and e-commerce poster methodology.

---

## Core Principle

**Text positioning comes BEFORE scene details.** GPT-Image-2 processes prompts sequentially — text specified early gets priority in layout planning.

---

## The 6-Field Structure for Complex Typography

```
[Scene + Background] + 
[Product/Subject with scale %] + 
[Text Layer 1: position + content + specs] + 
[Text Layer 2: position + content + specs] + 
[Text Layer N: position + content + specs] + 
[Whitespace mandate] + 
[Typography font lock] + 
[Composition details] + 
[Negative constraints]
```

### Why This Order?

1. **Scene** — establishes canvas
2. **Subject scale** — reserves space (e.g., "product occupies 40% of frame")
3. **Text layers** — positioned while layout is flexible
4. **Whitespace** — prevents AI from filling every pixel
5. **Font lock** — prevents font drift
6. **Composition** — camera, lighting, color grade
7. **Negatives** — "no extra text, no watermarks"

---

## Text Layer Specification Format

Each text layer needs **5 components**:

```
[Position] + [Content in 「」quotes] + [Size in pt] + [Color hex] + [Weight/style]
```

### Position Vocabulary

- **Absolute:** `Top-left`, `Top-center`, `Top-right`, `Center-left`, `Center`, `Center-right`, `Bottom-left`, `Bottom-center`, `Bottom-right`
- **Relative:** `Above product`, `Below headline`, `Overlapping subject torso`, `Upper-mid frame`, `Lower third`
- **Percentage-based:** `25% from left edge, 15% from top edge`

### Size Specification

- **Point sizes:** `24pt`, `48pt`, `240pt` (absolute)
- **Frame percentage:** `40% of frame height`, `8% of frame height` (relative)
- **Hierarchy ratios:** `Headline 5× body text size`

### Examples

```
Top-center text 「ISUPPLY PHILIPPINES 2021」 stacked 3 lines, 24pt white sans-serif medium weight
```

```
Center-left massive headline 「Pro 2」 240pt white sans-serif bold (40% of frame height)
```

```
Bottom-center button 「BUY NOW」 28pt black text on white rounded pill background
```

---

## Whitespace Mandate

**Critical for preventing text cramming.** Always specify:

```
At least 50% whitespace, at least 80px padding around product
```

or

```
At least 30% negative space upper-right quadrant
```

Without this, GPT-Image-2 fills every available pixel.

---

## Font Locking

Prevent font drift by naming specific fonts:

```
Typography: SF Pro Display
```

```
Typography: Helvetica Neue or similar minimalist sans-serif
```

```
Headline font: bold sans-serif (Inter or Roboto style), body font: regular sans-serif
```

Generic "sans-serif" allows too much variation.

---

## Product/Subject Scale Control

Reserve space for subject before placing text:

```
Product centered, occupies 40% of frame width
```

```
Model positioned left occupying 35% of frame width
```

```
Subject fills 60% of frame, leaving 40% for text overlay
```

---

## Complete Working Example (5 Text Layers)

```
Outdoor elevated platform, powder blue sky (hex #9DBFE5) background,
Model positioned left occupying 35% of frame width,
Product (iSupply Pro 2 earbuds) in extended hand occupying 15% of frame,

Top-center text 「ISUPPLY PHILIPPINES 2021」 stacked 3 lines, 24pt white sans-serif medium weight,
Upper-mid text 「Active Noise Cancellation」 36pt white sans-serif regular,
Center-left massive headline 「Pro 2」 240pt white sans-serif bold (40% of frame height),
Below headline text 「₱749.99」 48pt white serif italic,
Bottom-center button 「BUY NOW」 28pt black text on white rounded pill background,

At least 30% negative space upper-right quadrant,
Typography: Helvetica Neue or SF Pro Display,
Low camera angle looking up, 28mm wide lens, f/4.5 slight background blur,
Cool desaturated editorial color grade, lifted blacks,
Soft diffused natural daylight from above and camera-right,
Long graphic shadows stretching diagonally,

no extra text, no duplicate letters, no watermarks, no hallucinated words
```

---

## Text Hierarchy Patterns

### 3-Tier Information Architecture (E-commerce)

**Layer 1 — Core Promise** (1 sentence, under 15 chars)
- Answers: "What is the biggest benefit?"
- Size: 48-72pt
- Position: Top or center-dominant

**Layer 2 — Key Evidence** (2-3 data points)
- Answers: "Why should I believe this?"
- Size: 18-24pt
- Position: Supporting, near product

**Layer 3 — Call to Action** (under 8 chars)
- Answers: "What should I do now?"
- Size: 28-36pt
- Position: Bottom or button

### Campaign/Editorial Pattern (Your Reference)

**Eyebrow text** (brand/context)
- Small, top, stacked or single line
- 20-28pt

**Subhead** (feature/benefit)
- Medium, upper-mid
- 32-40pt

**Hero headline** (product name/message)
- Massive, center-overlapping subject
- 180-300pt (35-45% frame height)

**Price/tagline** (supporting info)
- Medium-small, below headline
- 40-56pt, often serif italic for contrast

**CTA button** (action)
- Small-medium, bottom center
- 24-32pt, high contrast background

---

## Multi-Language Typography

GPT-Image-2 achieves 95%+ accuracy across:
- Latin scripts
- CJK (Chinese, Japanese, Korean)
- Hindi, Bengali, Arabic

**For non-Latin scripts:**
- Specify script explicitly: `Chinese characters`, `Japanese kanji`
- Use native quotes: 「text」 for CJK
- Increase pt size +20% for readability

---

## Common Failures & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| Text too small/illegible | Size specified too late in prompt | Move text specs before composition details |
| Wrong font style | Generic "sans-serif" | Lock specific font: "SF Pro Display" |
| Text crammed together | No whitespace mandate | Add "at least 50% whitespace" |
| Text in wrong position | Vague positioning | Use absolute position: "Top-center" not "near top" |
| Duplicate text appears | No negative constraint | Add "no extra text, no duplicate letters" |
| Font weight wrong | Weight not specified | Add "bold" / "medium" / "regular" to each layer |
| Hierarchy lost | All text same priority | Specify pt sizes with 2-3× ratio between levels |

---

## Quality Settings for Typography

- **`quality: "low"`** — iteration only, text may blur
- **`quality: "medium"`** — good for 2-3 text layers, single font
- **`quality: "high"`** — required for 4+ layers, small text, dense layouts

**Rule:** 4+ text layers = always use `quality: "high"`

---

## Resolution for Text-Heavy Images

Minimum resolutions for legibility:

- **2-3 text layers:** 1024×1024 minimum
- **4-5 text layers:** 1536×1024 or 1024×1536 minimum
- **6+ text layers or small text:** 2048×3072 or higher

**4K (3840px long edge) recommended for:**
- Print output
- Billboard/signage mockups
- UI with small interface text
- Multi-language dense layouts

---

## API Parameters for Typography Control

```json
{
  "model": "gpt-image-2",
  "prompt": "[structured prompt with text layers]",
  "quality": "high",
  "size": "1024x1536",
  "output_format": "png",
  "n": 1
}
```

**For style replication with reference:**

```json
{
  "model": "gpt-image-2",
  "prompt": "Image 1: reference style. [structured prompt]. Match Image 1's typography hierarchy, color palette, layout grid.",
  "images": [
    { "image_url": "https://..." }
  ],
  "quality": "high",
  "input_fidelity": "high",
  "size": "1024x1536",
  "output_format": "png"
}
```

---

## When to Use `/v1/images/edits` vs `/v1/images/generations`

**Use `/edits` with reference image when:**
- Replicating existing style/layout
- Matching specific typography hierarchy from reference
- Preserving exact color palette
- Need `input_fidelity: "high"` for brand consistency

**Use `/generations` when:**
- Creating from scratch
- No reference image
- Full creative freedom

---

## Iteration Workflow for Complex Typography

1. **First pass:** `quality: "low"`, 1024px, verify text appears in correct positions
2. **Second pass:** Adjust pt sizes and positions based on first output
3. **Third pass:** `quality: "medium"`, verify hierarchy and legibility
4. **Final:** `quality: "high"`, 4K resolution for production

**Budget:** Complex typography (5+ layers) may need 3-5 iterations to perfect.

---

## Sources

- [OpenAI Cookbook — Image Gen Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [GPT-Image-2 E-commerce Practical Guide — Apiyi.com](https://help.apiyi.com/en/gpt-image-2-ecommerce-product-image-from-long-text-to-elegant-design-en.html)
- [Higgsfield — GPT Image 2](https://higgsfield.ai/gpt-2)
- [fal.ai — GPT Image 2 API](https://fal.ai/models/openai/gpt-image-2)

---

**Last Updated:** 2026-05-05
**Version:** 1.0
