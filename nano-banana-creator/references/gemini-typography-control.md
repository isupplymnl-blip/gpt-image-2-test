# Gemini (Nano Banana) Typography Control Reference

Advanced prompting patterns for complex multi-layer typography in Gemini image generation models (Nano Banana Pro, Nano Banana 2). Based on Google Cloud official guide, production testing, and e-commerce poster methodology adapted for Gemini.

---

## Core Principle

**Gemini processes narrative prose sequentially.** Unlike GPT-Image-2's strict positional syntax, Gemini reads full sentences and ordered paragraphs. Text specification should be **integrated into the narrative flow**, not tacked on as afterthought.

---

## The Narrative Structure for Complex Typography

```
[Strong opening verb] + 
[Scene + Background] + 
[Subject with action] + 
[Product/Subject scale and position] + 
[Text Layer 1: integrated into scene description] + 
[Text Layer 2: integrated into scene description] + 
[Text Layer N: integrated into scene description] + 
[Composition details: camera, lens, angle] + 
[Lighting: direction, quality, temperature] + 
[Style and quality markers]
```

### Why This Order?

1. **Strong verb** — tells Gemini the operation (Photograph, Render, Generate, Edit)
2. **Scene** — establishes canvas and context
3. **Subject + action** — main focus with narrative flow
4. **Text layers** — woven into scene description naturally
5. **Composition** — camera and framing
6. **Lighting** — direction and quality
7. **Style** — final aesthetic markers

---

## Text Layer Specification Format

Each text layer needs **5 components integrated into narrative**:

```
[Position] text reading "[EXACT TEXT]" in [font style], [color], [size description]
```

### Position Vocabulary

- **Absolute:** `Top-left corner`, `Top-center`, `Bottom-right`, `Center of frame`
- **Relative:** `Above the product`, `Below the headline`, `Overlapping the model's torso`, `Upper third of frame`
- **Narrative:** `Centered headline`, `Small text at the bottom`, `Large display text dominating the left side`

### Font Specification

Gemini responds well to **style descriptions** rather than exact font names:

- `Bold sans-serif` (generic, reliable)
- `Brush Script` (specific style)
- `Century Gothic` (specific font)
- `Impact bold` (font + weight)
- `Serif italic` (style + modifier)
- `Minimal sans-serif` (style + aesthetic)

### Size Specification

- **Relative:** `Large headline`, `Small caption`, `Massive display text`
- **Percentage:** `12% of frame height`, `40% of frame height`
- **Hierarchy:** `Headline 5× larger than body text`

### Examples

```
Top-center text reading "ISUPPLY PHILIPPINES 2021" in white sans-serif medium weight, stacked across 3 lines
```

```
Massive headline reading "Pro 2" in white sans-serif bold, center-left overlapping the model's torso, occupying 40% of frame height
```

```
Bottom-center button reading "BUY NOW" in black text on white rounded pill background
```

---

## Complete Working Example (5 Text Layers)

```
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42, ratio=2:3, resolution=2K]

Photograph an outdoor elevated platform campaign visual with powder blue sky background (hex #9DBFE5). 
A 20-year-old Chinese-Filipina woman positioned in the left 35% of frame, holding iSupply Pro 2 
wireless earbuds (matte white stem-style with charging case) in her extended left hand occupying 
15% of frame.

Top-center text reading "ISUPPLY PHILIPPINES 2021" in white sans-serif medium weight, stacked 
across 3 lines, 24pt size. Upper-mid frame text reading "Active Noise Cancellation" in white 
sans-serif regular, 36pt. Massive center-left headline reading "Pro 2" in white sans-serif bold, 
overlapping the model's torso, 240pt (40% of frame height). Below the headline, text reading 
"₱749.99" in white serif italic, 48pt. Bottom-center button reading "BUY NOW" in black text on 
white rounded pill background, 28pt.

At least 30% negative space in upper-right quadrant. Typography: Helvetica Neue or SF Pro Display 
style. Low camera angle looking up at subject, 28mm wide-angle lens, f/4.5 slight background blur. 
Soft diffused natural daylight from above and camera-right, 5500K neutral temperature, long graphic 
shadows stretching diagonally with soft edges. Cool desaturated editorial color grade with lifted 
blacks.

Fitzpatrick III skin — golden beige complexion with warm yellow undertone, natural micro-texture 
visible, light catches the high planes of cheekbones. Authentic skin with subtle pore visibility, 
not airbrushed. Shoulder-length dark brown wavy hair wind-tousled. Wearing cream linen beach wear — 
relaxed tank and high-waisted shorts. Contrapposto stance, weight on right hip, body angled 30 
degrees creating diagonal energy. Direct confident gaze at camera, slight natural smile.

Shot on Hasselblad X2D 100C, 85mm equivalent, editorial photography, commercial quality. Render 
all text verbatim with no extra characters, no duplicate letters, no hallucinated words.
```

---

## Text Rendering Rules (Gemini-Specific)

### 1. Quote Exact Text

```
✅ text reading "GLOW UP" centered
❌ text saying glow up
```

Unquoted text gets paraphrased.

### 2. Specify Font Style + Weight + Size

```
"GLOW UP" in Brush Script, metallic gold, 12% of frame height
```

```
"10% OFF" in Impact bold, black, 18% of frame height
```

### 3. Demand Verbatim Rendering

Add explicit constraint at end:

```
Render all text verbatim with no extra characters, no duplicate letters, no hallucinated words.
```

### 4. Translate/Localize

Gemini can translate in-image text:

```
After rendering the English version, also output a Japanese variant with the same three lines 
translated into Japanese with appropriate typographic conventions.
```

```
Translate this poster into Arabic with right-to-left layout and Arabic-appropriate typography. 
Preserve visual hierarchy, color palette, and composition.
```

### 5. Text-First Hack

For complex typography, generate text concepts in chat first, then ask for image:

**Turn 1:** "Draft 3 headline options for a skincare ad"
**Turn 2:** "Render a poster with headline '[chosen option]' in bold sans-serif..."

### 6. Brand Logo Accuracy

For logos with specific spelling/proportions:

```
Image 1: brand logo reference — preserve glyph shapes, clearspace, and color exactly.

Apply the logo from Image 1 to [surface], matching [lighting/texture/depth].
```

---

## Multi-Reference Labeling for Typography

When using reference images for style replication:

```
Image 1: reference style — typography hierarchy, layout grid, color palette to match.
Image 2: product reference — matte white earbuds, preserve exact shape and finish.

Photograph [scene description with text layers matching Image 1's hierarchy]. 
Match Image 1's typography positioning, size ratios, and visual hierarchy. 
Preserve Image 2's product identity exactly.
```

---

## Whitespace Control

Gemini responds to **narrative whitespace descriptions**:

```
At least 30% negative space in upper-right quadrant for visual breathing room.
```

```
Generous whitespace surrounding the product, at least 50% of frame empty.
```

```
Minimalist composition with the subject occupying only the left third, leaving right two-thirds 
for text overlay.
```

---

## Typography Hierarchy Patterns

### 3-Tier Campaign Pattern

**Eyebrow text** (brand/context)
- Small, top, stacked or single line
- 20-28pt or "small text"

**Subhead** (feature/benefit)
- Medium, upper-mid
- 32-40pt or "medium text"

**Hero headline** (product name/message)
- Massive, center-overlapping subject
- 180-300pt or "40% of frame height" or "massive display text"

**Price/tagline** (supporting info)
- Medium-small, below headline
- 40-56pt, often serif italic for contrast

**CTA button** (action)
- Small-medium, bottom center
- 24-32pt, high contrast background

### E-commerce 3-Layer Pattern

**Layer 1 — Core Promise** (1 sentence, under 15 chars)
- Answers: "What is the biggest benefit?"
- Size: Large headline, 48-72pt
- Position: Top or center-dominant

**Layer 2 — Key Evidence** (2-3 data points)
- Answers: "Why should I believe this?"
- Size: Small supporting text, 18-24pt
- Position: Near product

**Layer 3 — Call to Action** (under 8 chars)
- Answers: "What should I do now?"
- Size: Medium button text, 28-36pt
- Position: Bottom or button

---

## Font Style Matching

Gemini cannot detect exact font names. Use **style descriptions**:

**Reference shows:**
- Clean geometric sans → "SF Pro Display or Helvetica Neue style"
- Classic high-contrast serif → "Playfair Display or Didot style"
- Rounded friendly sans → "Circular or Avenir Next Rounded style"
- Monospace technical → "SF Mono or Courier style"
- Script/handwritten → "Brush Script or handwritten calligraphy style"

---

## Color Specification

**For brand-critical colors:**
- Include hex codes: `powder blue sky (hex #9DBFE5)`
- Name colors specifically: `metallic gold`, `graphite grey`, `warm cream`

**For text colors:**
```
white text (hex #FFFFFF)
black text (hex #0A0A0A)
metallic gold text
graphite text (hex #3A3A3A)
```

---

## Resolution & Quality for Typography

### Resolution Tiers

| Tier | Use Case |
|---|---|
| 0.5K | Iteration only (Flash only) |
| 1K | Standard, 2-3 text layers |
| 2K | High-quality, 4-5 text layers |
| 4K | Print, 6+ layers, small text |

**Rule:** 4+ text layers = use 2K or 4K

### Model Selection

| Model | Best For | Reference Image Limits |
|---|---|---|
| `gemini-3-pro-image-preview` | Complex text (5+ layers), brand-critical accuracy, small text | 6 high-fidelity objects + 5 character references (11 total) |
| `gemini-3.1-flash-image-preview` | Standard typography (2-4 layers), faster iteration, Image Search | 10 high-fidelity objects + 4 character references (14 total) |
| `gemini-2.5-flash-image` | Legacy, not recommended for new work | Unknown limits |

**Text length guideline:** Keep text under 25 characters per element for best rendering accuracy (Imagen 4 finding applies to Gemini models).

---

## API Parameters for Typography

```javascript
{
  model: "gemini-3-pro-image-preview",  // or gemini-3.1-flash-image-preview
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
    temperature: 0.7,        // Lower for text accuracy
    topP: 0.93,
    topK: 32,
    seed: 42,
    candidateCount: 1,
    
    // Gemini 3 models only — reasoning before generation
    thinking_level: "High",  // "Minimal" or "High"
    include_thoughts: true   // Include reasoning in response
  },
  // Optional for style replication:
  contents: [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64Image1 } },
        { text: "Image 1: reference style..." }
      ]
    }
  ],
  // Optional for real-time visual context (3.1 Flash only):
  tools: [{ imageSearch: {} }]  // Cannot search people
}
```

### Parameter Tuning for Typography

**For full parameter tuning table (authoritative source), see:**
`nano-banana-creator/agents/agent-5-supervisor/SKILL.md` → Parameter Tuning

**Typography-specific quick reference:**

| Goal | temperature | topP | topK | thinking_level |
|---|---|---|---|---|
| Exact text accuracy | 0.5-0.7 | 0.90 | 25-32 | High |
| Creative typography | 0.9-1.1 | 0.97 | 40 | Minimal |
| Brand-critical | 0.3-0.5 | 0.85 | 20 | High |

### Thinking Mode (Gemini 3 Models Only)

**What it does:** Model reasons about the prompt before generating, improving complex scene understanding and text accuracy.

**When to use:**
- Complex typography (5+ layers)
- Style replication with reference images
- Brand-critical accuracy
- Multi-step scene construction

**How to use:**
```javascript
generationConfig: {
  thinking_level: "High",    // "Minimal" or "High"
  include_thoughts: true     // Get reasoning text before image
}
```

**Multi-turn consistency:** Save `thought_signature` from response, pass back in next turn:
```javascript
contents: [
  {
    role: "model",
    parts: [{ thought_signature: previousThoughtSignature }]
  },
  {
    role: "user",
    parts: [{ text: "Now adjust the headline size to 60pt" }]
  }
]
```

---

## Aspect Ratios

**Both Pro and Flash:** 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9

**Flash only (ultra-wide):** 1:4, 4:1, 1:8, 8:1

Platform recommendations:
- IG Feed: 1:1 or 4:5
- IG Story/Reels/TikTok: 9:16
- YouTube thumbnail: 16:9
- LinkedIn portrait: 3:4 or 2:3
- Wide banner: 21:9
- Skyscraper: 1:4 (Flash only)

---

## Iteration Workflow for Complex Typography

1. **Draft at 1K** with `temperature: 1.0`, verify text appears and is legible
2. **Refine conversationally** — Gemini preserves context across turns, adjust text positioning/size
3. **Lock seed** once hierarchy is correct
4. **Re-render at 2K or 4K** with `temperature: 0.7` for final

**Budget:** Complex typography (5+ layers) may need 2-4 iterations.

### Step-by-Step Scene Construction

For ultra-complex scenes (6+ text layers, multiple subjects, intricate composition):

**Turn 1:** Generate base scene without text
```
Photograph outdoor elevated platform with powder blue sky, 20-year-old Chinese-Filipina woman 
left 35% of frame holding white earbuds. Soft daylight, editorial grade.
```

**Turn 2:** Add primary text layers
```
Add text: Top-center "ISUPPLY PHILIPPINES 2021" white sans-serif stacked 3 lines. 
Massive center-left "Pro 2" white bold overlapping torso 40% frame height.
```

**Turn 3:** Add secondary text layers
```
Add text: Upper-mid "Active Noise Cancellation" white 36pt. Below headline "₱749.99" white serif 48pt. 
Bottom-center "BUY NOW" button black on white pill 28pt.
```

**Why this works:** Gemini processes each instruction sequentially, reducing text rendering errors in complex scenes.

---

## Common Failures & Fixes

| Symptom | Fix |
|---|---|
| Text illegible/wrong | Quote text exactly, specify font + weight + size, use Pro model, lower temperature to 0.5-0.7 |
| Text in wrong position | Use narrative positioning: "top-center", "overlapping torso", not vague "near top" |
| Wrong font style | Lock specific font: "Helvetica Neue style" not generic "sans-serif" |
| Text too small | Specify size: "40% of frame height" or "large headline 72pt" |
| Hierarchy lost | Specify size ratios: "headline 5× larger than body text" |
| Duplicate text | Add constraint: "no duplicate letters, no extra text" |
| Text crammed | Add whitespace mandate: "at least 30% negative space upper-right" |

---

## Multi-Language Typography

Gemini handles multilingual text well:

**Supported scripts:**
- Latin
- CJK (Chinese, Japanese, Korean)
- Hindi, Bengali
- Arabic (with RTL layout)

**For non-Latin:**
```
Render the menu in Japanese with proper typography and spacing conventions.
```

```
Translate this poster into Arabic with right-to-left layout, preserving visual hierarchy.
```

---

## Style Replication Pattern

When replicating reference typography:

```
Image 1: reference style — typography hierarchy, layout grid, color palette.

Photograph [new scene] matching Image 1's typography positioning and size ratios. 
Top-center text reading "[new text]" in same style as Image 1's eyebrow text.
Massive headline reading "[new text]" in same style and position as Image 1's hero headline.
[Continue for each text layer...]

Preserve Image 1's visual hierarchy, whitespace distribution, and typography scale relationships.
```

---

## Positive Framing Rule

**Critical for Gemini:** Negative phrasing confuses the model and may insert the negated element.

| ❌ Negative | ✅ Positive |
|---|---|
| `no extra text` | `render only the specified text` |
| `no harsh lighting` | `soft diffused lighting` |
| `no distractions` | `clean minimalist background` |
| `no cars on street` | `empty street` |

---

## Strong Opening Verb

Start prompts with action verbs:

- `Photograph` — for realistic photography
- `Render` — for graphics/posters/UI
- `Generate` — for general creation
- `Edit` — for modifications
- `Apply` — for compositing
- `Translate` — for localization

**Example:**
```
Render a minimalist e-commerce poster with...
```

```
Photograph a campaign visual with...
```

---

## Web Search for Real-Time Typography

For content requiring current information:

```
tools: [{ googleSearch: {} }]

Search for [current information]. Render a poster with headline reading "[dynamic content from search]" 
in bold sans-serif, centered, 40% of frame height.
```

**Use cases:**
- Current weather/date
- Live event details
- Real-time data visualization
- Trend-aware content

---

## Image Search (3.1 Flash Only)

**New capability:** Use web images as visual context for generation.

```javascript
tools: [{ imageSearch: {} }]
```

**What it does:** Model searches web for relevant images, uses them as visual reference during generation.

**Use cases:**
- "Generate poster with Eiffel Tower in background" (searches for Eiffel Tower images)
- "Product shot with Tokyo street aesthetic" (searches Tokyo street photography)
- "Magazine cover with Vogue editorial style" (searches Vogue covers)

**Limitations:**
- **Cannot search people** — no celebrity faces, no specific individuals
- **3.1 Flash only** — not available on Pro models
- **Visual reference only** — doesn't extract/copy elements, just informs style

**Example:**
```javascript
{
  model: "gemini-3.1-flash-image-preview",
  tools: [{ imageSearch: {} }],
  contents: [{
    role: "user",
    parts: [{
      text: "Photograph product on marble surface with Santorini sunset aesthetic. Search for Santorini sunset images to match color palette and lighting quality."
    }]
  }]
}
```

---

## Watermarking Awareness

**All Gemini outputs include:**
- **C2PA** — cryptographic provenance metadata
- **SynthID** — invisible AI watermark in pixels

Cannot be disabled. Watermarks survive resize, screenshot, minor edits.

---

## Limitations

1. **Small text (<2% frame)** may render with errors — keep text under 25 characters per element for best accuracy
2. **Highly stylized scripts** less reliable than standard fonts
3. **Dense paragraphs** (>50 words) may have character errors
4. **Character consistency** across edits requires fixed seed + multimodal blending + thought signatures (Gemini 3)
5. **Reference image limits:**
   - **Flash:** 10 high-fidelity objects + 4 character references (14 total)
   - **Pro:** 6 high-fidelity objects + 5 character references (11 total)
6. **Translation grammar** imperfect for lesser-resourced languages
7. **Image Search** cannot search people (3.1 Flash only)

---

## Supported Languages (Best Performance)

**Tier 1 (Highest accuracy):**
- English
- Chinese (Simplified & Traditional)
- Japanese
- Korean
- Spanish
- French
- German
- Portuguese
- Italian

**Tier 2 (Good accuracy):**
- Hindi
- Bengali
- Arabic
- Russian
- Turkish
- Thai
- Vietnamese
- Indonesian

**For other languages:** Test at 1K resolution first, may need higher temperature (0.8-1.0) for better character rendering.

---

## Quick Reference Checklist

Before generating with complex typography:

- [ ] **Strong opening verb** (Photograph, Render, Generate)
- [ ] **Text quoted exactly** with "..." around each text element
- [ ] **Text under 25 chars per element** (for best accuracy)
- [ ] **Font style specified** (bold sans-serif, Brush Script, etc.)
- [ ] **Size specified** (pt size or % of frame height)
- [ ] **Position specified** (top-center, overlapping torso, etc.)
- [ ] **Color specified** (white, metallic gold, hex codes)
- [ ] **Whitespace mandate** (30% negative space, etc.)
- [ ] **Verbatim constraint** ("no extra characters, no duplicate letters")
- [ ] **Positive framing** (no negative phrasing)
- [ ] **Aspect ratio** matches platform
- [ ] **Resolution tier** matches deliverable (1K iterate → 4K final)
- [ ] **Model selection** (Pro for complex text, Flash for speed)
- [ ] **Temperature lowered** (0.5-0.7 for text accuracy)
- [ ] **Seed locked** for consistency
- [ ] **Thinking mode enabled** for complex scenes (Gemini 3 only)
- [ ] **Reference image count** within limits (Flash: 14, Pro: 11)
- [ ] **Step-by-step construction** for 6+ text layers

---

## Batch Generation for High-Volume

For campaigns requiring multiple variants:

```javascript
// Batch API — up to 10,000 requests
{
  requests: [
    { model: "gemini-3.1-flash-image-preview", contents: [...], generationConfig: {...} },
    { model: "gemini-3.1-flash-image-preview", contents: [...], generationConfig: {...} },
    // ... up to 10,000
  ]
}
```

**Use cases:**
- A/B testing (same prompt, different seeds)
- Multi-language campaigns (same layout, translated text)
- Product variants (same scene, different products)
- Seasonal campaigns (same template, seasonal colors/text)

**Cost optimization:** Batch API has lower per-request cost than individual calls.

---

## Sources

- [Google Cloud — Ultimate Prompting Guide for Nano Banana](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
- [Google Blog — Prompting Tips Nano Banana Pro](https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/)
- [Google AI — Gemini API Image Generation](https://ai.google.dev/gemini-api/docs/image-generation) — Thinking mode, Image Search, reference limits, step-by-step construction, text length guidelines
- Internal: `nano-banana-creator/references/agent-intelligence.md`, `prompt-patterns.md`, `api-reference.md`
- E-commerce pattern adapted from GPT-Image-2 methodology

---

**Last Updated:** 2026-05-04
**Version:** 1.1
