# Nano Banana Playbook — Fix Plan + Before/After

Parallel to `docs/director-before-after-playbook.md` (OpenAI). Documents the gap between the current Director behavior on Gemini provider and the official Nano Banana playbook, and lays out the fix plan in execution order.

---

## Baseline — What's Already Aligned (~70%)

From the verification audit:

| Area | Coverage | Where |
|---|---|---|
| Photography vocabulary (camera / lens / film) | 90% | `prompt-patterns.md`, Director's quality tags |
| Lighting-first ordering | 90% | Agent 3 Setting Creator |
| Materiality / texture | 85% | `prompt-patterns.md` product templates |
| Fitzpatrick skin formula | 95% | `agent-intelligence.md` |
| Anti-plastic-skin phrases | 90% | `agent-intelligence.md` |
| Shot type vocabulary | 90% | `prompt-patterns.md` ECU/CU/MS/LS table |
| Color temperature reference | 90% | `prompt-patterns.md` 2700K–8000K table |
| Multimodal references (`inlineData`) | 80% | `api-reference.md` |
| Multi-turn editing | 80% | `api-reference.md` chat example |
| Seed exploration | 90% | `prompt-patterns.md` |
| API params (temp/topP/topK/seed) | 95% | `api-reference.md` |
| Web search grounding tool | 60% | Mentioned; no framework |

## Gaps — What Needs Fixing (~30%)

| # | Gap | Severity | Scope |
|---|---|---|---|
| G1 | Text rendering rules (quote text, font specs, text-first hack, translate) | **HIGH** | No rules documented for Gemini |
| G2 | Positive framing rule (`empty street` not `no cars`) | **HIGH** | Zero mentions anywhere |
| G3 | Strong opening verb (`Generate` / `Photograph` / `Edit`) | MEDIUM | Director stitching starts with shot type |
| G4 | 5-element framework (Subject / Action / Location / Composition / Style) | MEDIUM | Only internal stitching formula documented |
| G5 | Max 14 reference images cap | MEDIUM | `api-reference.md` doesn't state the limit |
| G6 | Full aspect ratio list (missing 3:2, 2:3, 4:3, 5:4, ultra-wide 1:4/4:1/1:8/8:1) | **HIGH** | Phase 6 form only has 6 ratios |
| G7 | Resolution tiers 0.5K / 1K / 2K / 4K | **HIGH** | Only 1024px sizes in `api-reference.md` |
| G8 | Image blending for character consistency (6–14 refs) | MEDIUM | Not documented as capability |
| G9 | Brand consistency (logo on 3D surface technique) | LOW | Partial via brand DNA |
| G10 | C2PA + SynthID watermarking awareness | LOW | Zero mention; affects downstream workflows |
| G11 | Real-time web search prompting framework | MEDIUM | Tool mentioned, framework missing |
| G12 | Translate/localize text in images | MEDIUM | Multilingual text rendering undocumented |
| G13 | Real-world knowledge / reasoning leverage | LOW | Gemini 3 Pro reasoning not flagged |

---

## Fix Plan — Execution Order

Mirrors the OpenAI Option C approach — no agent `SKILL.md` files modified.

| Step | File | Change | Addresses gaps |
|---|---|---|---|
| **1** | CREATE `nano-banana-creator/references/gemini-prompting.md` | New reference file with the 13 missing rules (parallel to `openai-prompting.md`) | G1–G13 |
| **2** | EDIT `app/lib/skillLoader.ts` | Register new reference file in the skill loader | enables #1 |
| **3** | EDIT `app/api/chat/route.ts` | When `provider === 'gemini'`, append a Gemini hard-rules block to the system prompt mirroring the OpenAI one | G1, G2, G3, G4, G11 |
| **4** | EDIT `app/lib/skillLoader.ts` Phase 6 form | Expand `aspect_ratio` select to include 3:2, 2:3, 4:3, 5:4, and (for Flash) 1:4, 4:1, 1:8, 8:1 | G6 |
| **5** | EDIT `app/lib/skillLoader.ts` Phase 6 form | Add `resolution_tier` field: 0.5K / 1K / 2K / 4K | G7 |
| **6** | EDIT `app/api/chat/route.ts` Gemini provider block | Document Gemini size-by-tier mapping, 14-ref cap, and blending guidance | G5, G8 |
| **7** | EDIT `docs/prompting-playbook.md` footer | Cross-link to new Nano Banana playbook | housekeeping |

### Files changed

| File | Action | New size |
|---|---|---|
| `nano-banana-creator/references/gemini-prompting.md` | CREATE | ~10KB |
| `app/lib/skillLoader.ts` | EDIT | +2 lines (loader), +~15 lines (Phase 6 form) |
| `app/api/chat/route.ts` | EDIT | +~15 lines (Gemini hard-rules block) |
| `docs/prompting-playbook.md` | EDIT | +2 lines |

### What stays untouched

- All 9 agent `SKILL.md` files under `nano-banana-creator/agents/*/`
- `agent-intelligence.md` (skin formulas, lighting library, pose vocabulary already playbook-compliant)
- `prompt-patterns.md` (scene templates already strong)
- `api-reference.md` (params already correct) — may add cross-link to new file
- OpenAI flow — no changes

---

## Before / After — Director Output on Gemini

Mirrors `docs/director-before-after-playbook.md` structure. Four representative scenarios.

### Scenario 1 — Beach Lifestyle (Model + Product)

**Inputs:** 25-year-old Chinese-Filipina model, SPF serum product ref connected as UploadNode, tropical beach setting, 4:5 IG Feed ad.

#### Before (Gemini today)

```
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42]
A beautiful 25-year-old Chinese-Filipina woman on a tropical beach, holding a
skincare serum bottle, no harsh lighting, no oversaturation, smiling naturally.
Stunning editorial photography with perfect golden hour lighting.
```

**Problems:**
- `beautiful`, `stunning`, `perfect` — anti-slop violations
- `no harsh lighting, no oversaturation` — **negative framing** (will invert, Gemini may produce harsh or oversaturated)
- No strong opening verb
- No skin formula (Fitzpatrick + texture + light interaction)
- No quoted brand text on product label
- No Image N label for the product ref
- No camera/lens vocabulary
- No materiality for outfit

#### After (playbook-compliant)

```
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42, ratio=4:5, resolution=2K]
Image 1: SPF serum product reference — 30ml amber frosted glass bottle with white dropper cap,
label reading "BOTANICA SPF 50" in minimal sans-serif. Match shape, color, material, and label
text exactly.

Photograph a 25-year-old Chinese-Filipina woman in contrapposto stance at a white-sand tropical
beach, applying the SPF serum from Image 1 to her left cheekbone with her fingertip. Medium-full
shot, 85mm f/1.4, slight low angle. Warm directional sunlight from camera-left at 15° above
horizon, 3000K golden-hour light, long soft shadows, subtle atmospheric haze with lens flare from
the low sun.

Fitzpatrick IV skin — warm caramel with olive undertone, visible natural skin texture with subtle
micro-contrast, warm specular highlights on cheekbones and brow ridge. Not smooth, not plastic.
Shoulder-length dark brown hair softly tousled by the breeze, natural micro-expression of sensory
pleasure, eyes half-closed.

Wearing a cream linen shirt dress in flowy fit, 100% natural linen texture visible. Foreground:
dry sand texture slightly out of focus. Background: blurred waterline and ocean at f/1.4 bokeh,
ankle-depth crystal-clear turquoise water 2 meters behind, small rolling waves in the distance.

Shot on Hasselblad X2D 100C, 85mm f/1.4, ISO 100, RAW — hyperrealistic editorial photography,
4:5 IG feed composition, commercial product photography. Preserve Image 1's label text and bottle
shape unchanged.
```

**Rule matrix:**
| Rule | Applied |
|---|---|
| G3 Strong opening verb (`Photograph`) | ✅ |
| G4 5-element framework (Subject → Action → Location → Composition → Style) | ✅ |
| G1 Quoted product text (`"BOTANICA SPF 50"`) | ✅ |
| G2 Positive framing (no `no harsh…`) | ✅ |
| Skin formula (Fitzpatrick IV + texture + light) | ✅ (already in agent-intelligence, preserved) |
| Anti-plastic phrase | ✅ |
| Image N label in prompt body | ✅ |
| Lighting specific (3000K, 15° above horizon) | ✅ |
| Materiality (cream linen, frosted glass) | ✅ |
| Camera vocabulary (85mm f/1.4, slight low angle) | ✅ |
| Aspect ratio in API tag | ✅ |
| Preserve line for ref | ✅ |

---

### Scenario 2 — Marketing Poster with Multilingual Text

**Inputs:** 3-language e-commerce promo poster. English headline + Japanese localization + Arabic version. 1:1 IG Feed.

#### Before

```
[API: model=gemini-3-pro-image-preview, temp=0.8, topP=0.93, topK=32, seed=42]
A promotional poster with a bold headline about a sale. Clean minimalist design,
professional typography, no distractions.
```

**Problems:**
- No quoted text
- No font specs
- No translate/localize instruction
- `no distractions` — negative framing
- No composition guidance
- No text-first hack pattern

#### After

```
[API: model=gemini-3-pro-image-preview, temp=0.7, topP=0.93, topK=32, seed=42, ratio=1:1, resolution=2K]
Render a 1:1 minimalist e-commerce promotional poster with an off-white background (hex FAFAFA).

Text layers (render verbatim, no paraphrasing, no extra characters):
- Top: "GLOW UP" in Brush Script, metallic gold, 12% of frame height, centered
- Middle: "10% OFF" in Impact bold, black (hex 0A0A0A), 18% of frame height, centered
- Bottom: "Your First Order" in Century Gothic, medium weight, graphite (hex 3A3A3A), 4% of
  frame height, centered

Single small product icon (amber glass dropper bottle) sits between the middle and bottom text
blocks, occupying the centered middle 20% of frame height.

After rendering the English version, also output two additional localized variants: one with the
same three lines translated into Japanese with appropriate typographic conventions (right-to-left
not required), and one translated into Arabic with right-to-left layout and Arabic-appropriate
typography. Preserve the visual hierarchy, color palette, and composition across all three
versions.

Clean minimalist flat design, no photographic elements, no gradients, full solid-color background.
```

**Rule matrix:**
| Rule | Applied |
|---|---|
| G1 Quoted text (every line in `"..."`) | ✅ |
| G1 Font specs (family + weight + size %) | ✅ |
| G1 Text-first mental structure | ✅ |
| G12 Translate/localize | ✅ |
| G2 Positive framing (no `no distractions`) | ✅ |
| G3 Strong verb (`Render`) | ✅ |
| Aspect ratio + resolution in API tag | ✅ |
| Pro model selected (text quality) | ✅ |

---

### Scenario 3 — Multi-Reference Brand Mockup

**Inputs:** Brand logo + coffee mug product reference. Apply logo to mug. Ultra-wide 21:9 landing page banner.

#### Before

```
[API: model=gemini-3-pro-image-preview, temp=0.6, topP=0.90, topK=25, seed=42]
Put this logo on the coffee mug. Make it look natural and professional.
```

**Problems:**
- No Image N labels
- No preserve-and-change
- `natural and professional` — vague praise
- No aspect ratio specified
- No lighting/surface matching instruction

#### After

```
[API: model=gemini-3-pro-image-preview, temp=0.5, topP=0.90, topK=25, seed=42, ratio=21:9, resolution=4K]
Image 1: brand logo reference — preserve glyph shapes, clearspace, and color exactly.
Image 2: coffee mug reference — minimalist ceramic mug, matte glaze, existing shadows and depth
of field to be retained.

Apply the logo from Image 1 to the front curved ceramic surface of the mug in Image 2, sized at
roughly 40% of the visible mug face, horizontally centered. Wrap the logo naturally around the
surface curvature. Match the mug's existing lighting direction (soft top-down key from camera-
right at 5000K), existing shadows (light drop shadow below), existing depth of field, and existing
glaze reflectivity — the logo should look printed, not pasted.

Compose for a 21:9 ultra-wide landing page hero: mug positioned in the left third, 60% negative
space on the right for future headline overlay, subtle radial falloff toward the right edge.

Preserve Image 2's ceramic texture, matte finish, and shadow pattern unchanged. Preserve Image 1's
logo proportions and color unchanged. No reinterpretation of either.
```

**Rule matrix:**
| Rule | Applied |
|---|---|
| G5 Multi-reference labeling | ✅ |
| G9 Brand consistency (logo on 3D surface, preserve lighting/texture) | ✅ |
| Preserve-and-change both sides | ✅ |
| G6 Aspect ratio 21:9 | ✅ |
| G7 Resolution tier 4K | ✅ |
| G3 Strong verb (`Apply`) | ✅ |
| G2 Positive framing | ✅ |

---

### Scenario 4 — Real-Time Web Search

**Inputs:** Generate a "today's weather in San Francisco" desk lockscreen.

#### Before

```
[API: model=gemini-3.1-flash-image-preview, temp=0.9, topP=0.97, topK=40, seed=42]
Make a desktop wallpaper showing the current weather in San Francisco today.
```

**Problems:**
- No `googleSearch` tool enabled
- No web-search framework (source → task → visual)
- No composition guidance
- No aspect ratio

#### After

```
[API: model=gemini-3.1-flash-image-preview, temp=0.9, topP=0.97, topK=40, seed=42, ratio=16:9, resolution=4K]
tools: [{"googleSearch": {}}]

Source/Search request: Search for the current weather conditions, temperature, and date in San
Francisco right now. Also retrieve today's sunrise and sunset times.

Analytical task: Determine the scene's visual mood based on the result — foggy/rainy → muted
blues and greys; sunny → warm gold tones; evening → blue hour gradient.

Visual translation: Render a 16:9 desktop wallpaper. Centered bold sans-serif text "SAN FRANCISCO"
(hex FFFFFF) at 6% of frame height. Below it, today's date in format "May 2, 2026" in medium
weight at 3% of frame height. Below that, the current temperature in large display numerals with
a small weather icon (sun/cloud/rain) next to it matching actual conditions.

Background scene reflects the actual weather: if foggy, render muted fog-shrouded Golden Gate
Bridge silhouette; if sunny, render a clear bright bay view with Golden Gate in warm daylight.
Cinematic color grading matching the time of day retrieved from search.
```

**Rule matrix:**
| Rule | Applied |
|---|---|
| G11 Web Search Framework (Source → Task → Visual) | ✅ |
| `googleSearch` tool enabled | ✅ |
| G1 Quoted text | ✅ |
| G2 Positive framing | ✅ |
| G3 Strong verb structure | ✅ |
| G6 Aspect ratio 16:9 | ✅ |
| G7 Resolution 4K | ✅ |

---

## Summary Matrix — What the Playbook Changes

| Category | Before (today's Gemini output) | After (playbook-compliant) |
|---|---|---|
| Opening | Noun phrase (`A beautiful woman...`) | Strong verb (`Photograph...`, `Render...`, `Apply...`) |
| Vague praise | `stunning / beautiful / perfect / professional` everywhere | Replaced with visual facts (°K, f-stop, material, Fitzpatrick type) |
| Negative framing | `no harsh lighting`, `no distractions` | Rewritten positive: `soft diffused light`, `clean minimalist solid background` |
| Text in image | Unquoted, no font specs | Quoted verbatim + font family + weight + size + color + position |
| Multi-ref | No labels, vague "this logo" | `Image N: <role>` declared with preserve-and-change |
| Skin | `beautiful skin` | 3-part formula: Tone + Texture + Light interaction, Fitzpatrick named |
| Aspect ratio | Sometimes omitted | Always in API tag, matches platform |
| Resolution | Implicit / 1K default | Explicit tier 0.5K / 1K / 2K / 4K |
| Web search | Tool rarely invoked | Framework applied: Source → Task → Visual |
| Translation | Not attempted | Localized variants requested explicitly |
| Brand mockup | "Put logo on mug" | Logo ref + surface ref + preserve lighting/texture/DOF |

---

## What Does NOT Change

- **All 9 agents** — Brand DNA / Concept / Model / Setting / Product / Supervisor / Director / Copy / Prompt Repair roles intact
- **Humanizer Pass** (Director Step 8) — still runs
- **Camera Angle Audit** (Director Step 7) — still runs; plate flags preserved
- **Director's Stitching Formula** — still drives photo composition; Google's 5-element framework added as an alternative for editorial/illustration work
- **Fitzpatrick skin formula + anti-plastic phrases** — already compliant
- **Seed exploration tables** — already proven
- **OpenAI flow** — playbook rules are provider-scoped; OpenAI compliance untouched

---

## Execution Sequence (when approved)

1. Create `nano-banana-creator/references/gemini-prompting.md` (parallel to openai-prompting.md)
2. Register in `skillLoader.ts` file list
3. Add Gemini hard-rules block to `chat/route.ts` `buildSystemPrompt` under `provider === 'gemini'` branch
4. Expand Phase 6 form `aspect_ratio` options (3:2, 2:3, 4:3, 5:4, plus Flash-only ultras 1:4, 4:1, 1:8, 8:1)
5. Add `resolution_tier` field to Phase 6 form (0.5K / 1K / 2K / 4K) — conditional on provider
6. Cross-link from `docs/prompting-playbook.md` and `docs/nano-banana-prompting-playbook.md`
7. Run TypeScript check to verify no regressions
8. Document the change in commit message

---

**Last Updated:** 2026-05-02
**Status:** Plan — not yet executed. Awaiting approval.
