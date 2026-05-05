# OpenAI gpt-image-2 Prompting Rules

**When to apply:** every turn where the active provider is `openai`. These rules override generic Gemini-style prompting habits inside the agents. They do NOT replace Agent 2 (Model), Agent 3 (Setting), Agent 4 (Product) etc. — they shape HOW the Director stitches those blocks into the final Master Prompt for gpt-image-2.

Distilled from OpenAI's cookbook, fal.ai's guide, and production testing. Treat as defaults, not dogma.

---

## 1. Prompt Structure (Front-Load)

Order the Master Prompt in five slots:

```
Scene / background  →  Subject  →  Key details  →  Typography  →  Constraints
```

gpt-image-2 processes language sequentially. **The first 10 words carry the most visual weight.** If the headline is the point, say `Editorial poster with the headline "X"` before describing the background.

**Bad:** `A stunning, epic masterpiece of a product shot with amazing lighting`
**Good:** `White seamless studio background. Brushed aluminum water bottle, 45-degree angle. Soft key light from upper left, subtle rim light. Professional product photography, sharp focus. No text, no extra objects.`

---

## 2. Text Rendering Rules (HARD)

This is where gpt-image-2 earns its premium. Use the rules or lose them.

- **Always quote exact text.** `a poster reading "SHIPPED"` — not `a poster saying shipped`. Unquoted text gets paraphrased.
- **Specify typography.** Font style (serif / sans / mono), size (large / medium / small), weight, color, and position. Example: `Bold serif headline "LAUNCH DAY", centered, 40% of frame height, black on cream background.`
- **Demand verbatim rendering.** Append `no extra text, no duplicate letters, no hallucinated words` as a constraint line.
- **Spell tricky words letter-by-letter** for brand names or non-dictionary terms: `the word "ACME" (A-C-M-E)`.
- **Use `quality: high`** for small text, dense info panels, multi-font layouts. `medium` blurs fine type.
- **One quoted phrase per copy block.** For multi-text layouts: `Headline "LAUNCH DAY", subhead "May 1, 2026", CTA button "Get Started"` — don't run them together.

---

## 3. Multi-Reference Labeling

When using `/v1/images/edits` with 2+ references, **label every image by role** in the prompt body and reference those labels in the instruction:

```
Image 1: base scene to preserve
Image 2: jacket to composite onto the subject in Image 1
Image 3: boots to composite onto the subject in Image 1

Instruction: "Apply Image 2 and Image 3 to the subject in Image 1. Keep Image 1's lighting, background, and camera angle unchanged."
```

Without labels, the model guesses which reference is canonical. With labels, it follows instructions.

The `/generate-openai` route also injects per-image role directives (PRODUCT/MODEL/ENVIRONMENT REFERENCE) automatically at API call time based on asset name — but Director-written prompts should still declare the labels explicitly for redundancy.

---

## 4. Preserve-and-Change Language (for edits)

For surgical edits, state both sides explicitly — the model drifts otherwise.

- **Change:** `"Replace the jacket with the one from Image 2."`
- **Keep:** `"Keep the face, hair, pose, background, lighting, and color temperature unchanged."`

**Repeat the preserve list on every iteration.** Drift compounds across edits.

---

## 5. Lighting and Materials

Be specific. Generic prompts produce generic images.

**Lighting examples:**
- `Fluorescent ceiling light mixed with neon signage glow`
- `Dramatic orange-red gradient backlight, subject in silhouette`
- `Golden hour natural light, low angle, warm shadows`
- `Soft key light from upper left, subtle rim light, studio setup`

**Material examples:**
- `Matte cream paper, no gloss`
- `Brushed aluminum with fingerprint smudges`
- `Chipped paint on weathered wood`
- `Overcast daylight on wet asphalt`

---

## 6. Quality Levers (use sparingly)

Add these ONLY when the base prompt underdelivers. Stacking them turns output mushy.

| Keyword | When |
|---|---|
| `photorealism` | Single highest-leverage word for lifelike output. Drop into any prompt aiming for a real-photo look and realism jumps exponentially. **Skip for illustration, poster, or editorial-graphic work.** |
| `film grain / 35mm` | Analog warmth |
| `macro detail / shallow depth of field` | Product shots |
| `candid, unposed` | Defeats the default polished-studio look |
| `hand-drawn, pencil texture` | Editorial illustration |

**Anti-slop substitutions** (replace vague praise with visual facts):

| Vague | Visual fact |
|---|---|
| `stunning` | `overcast daylight, brushed aluminum` |
| `epic masterpiece` | `50mm lens feel, shallow depth of field` |
| `minimalist luxury` | `white seamless background, centered composition, soft shadows` |

---

## 7. Resolution & Aspect Ratios

gpt-image-2 accepts any WxH satisfying **four constraints**:

1. Max edge ≤ 3840px
2. Both edges multiples of 16
3. Long-to-short ratio ≤ 3:1
4. Total pixels between 655,360 and 8,294,400

**1920×1080 FAILS** (1080 not multiple of 16). Use `3840×2160` for exact 16:9 at 4K, or `1920×1088` for close-to-16:9 at 2K.

**Standard sizes:**

| Ratio | Use case | Standard | 4K / hi-res |
|---|---|---|---|
| 1:1 | IG post, square | 1024×1024 | 2880×2880 |
| 2:3 | LinkedIn portrait | 1024×1536 | 2048×3072 |
| 3:2 | Editorial landscape | 1536×1024 | 3072×2048 |
| 16:9 | YouTube, web hero | 2048×1152 | 3840×2160 |
| 9:16 | Reels, TikTok, Stories | 1024×1820 | 2160×3840 |
| 4:5 | FB feed ad | 1024×1280 | 2560×3200 |
| 3:1 | Max ultrawide | — | 3840×1280 |

---

## 8. API Parameters (Quick Ref)

Cross-link: full param surface is in `references/api-reference.md`. For prompting decisions:

**Endpoint routing (HARD POLICY):**
- **No reference images** → `POST /v1/images/generations` (text-to-image)
- **Any reference images attached (1–16)** → `POST /v1/images/edits`

The route layer enforces this automatically based on whether `referenceImages` is non-empty. Master Prompts should be written assuming the right endpoint will be picked — when refs exist, declare `Image N: <role>` labels in the prompt body per §3 (the model only sees the labels, not which endpoint the route chose).

**Quality / size / format:**

- `quality: low` — iteration, drafts
- `quality: medium` — client previews
- `quality: high` — finals, text-heavy layouts, small type
- `background: transparent` — product cutouts (requires PNG or WebP)
- `background: opaque` — full scenes
- `input_fidelity: high` — edits where identity/product preservation matters (face, brand, exact shape). Use on `/v1/images/edits` when refs are attached and the output must match them precisely.
- `output_format: png` — transparency, sharp edges
- `output_format: jpeg` — photos, smaller files
- `output_format: webp` — web delivery

---

## 9. Iteration Workflow

1. **Iterate at 1024px + `quality: low`** — cheap, fast. Test composition, framing, subject placement.
2. **Commit the winning prompt** — lock text, verify preserve/change lists for edits.
3. **Re-render at 4K + `quality: high`** for the final deliverable — print-ready, high-DPI screens.

Cost scales with size × quality. 4K at `high` is the most expensive combination. Don't start there.

---

## 10. Failure Modes and Fixes

| Symptom | Fix |
|---|---|
| Text illegible or wrong characters | `quality: high`, quote the text, spell tricky words letter-by-letter |
| Identity drifts across edits | Restate preserve list every iteration, use `input_fidelity: high` |
| Unwanted creative reinterpretation | Add `no new elements, preserve layout and perspective`, lock specifics |
| Overpolished / stock-photo feel | Use `candid, unposed, natural light` instead of `studio, cinematic` |
| Duplicate / extra words appear | Add `no extra text, no duplicate letters, single headline only` |
| Compositing looks pasted-on | Name lighting explicitly: `Match lighting from Image 1` |
| Slow generation (>60s) | Drop to `quality: medium`, or reduce reference image count |
| Resolution rejected | Verify both edges multiples of 16, ratio ≤ 3:1, total pixels ≤ 8.29M |

---

## 11. Director Integration Notes

These rules ADD TO (do not replace) the existing agent pipeline:

- **Agent 2 (Model)** — keep the 6-dimension framework. When writing model description for an OpenAI Master Prompt, follow anti-slop substitutions from section 6.
- **Agent 3 (Setting)** — lighting-first ordering still stands. Use section 5's lighting/material specificity vocabulary.
- **Agent 4 (Product)** — product accuracy language unchanged. When a product ref is attached, also declare `Image N: [product name] product reference — match shape, color, material, branding exactly.` in the Master Prompt body per section 3.
- **Agent 5 (Supervisor)** — pick `quality` and `size` per section 7–8. Skip Gemini-only params (temp/topP/topK/seed).
- **Agent 6 (Director)** — at Humanizer Pass (Step 8), also enforce sections 1, 2, 6. At stitching (Director's Stitching Formula), re-order to match section 1's 5-slot structure.
- **Agent 7 (Copy)** — when output will be rendered as text-in-image, use section 2's quoted-text + typography rules (not just IG captions).

---

## 12. Compatibility with Existing Rules

- **NO INDENT RULE** (Director's Master Prompt is one continuous block) — still applies.
- **Quality Tags** (Director Step 8 — `Shot on Hasselblad X2D 100C, 85mm f/1.4, ISO 100, RAW`) — OK to keep for photorealistic shoots. DROP for illustration/poster/editorial-graphic work per section 6.
- **[API:] tag on line 1** — still applies. Format: `[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]`.
- **Reference image role enrichment** happens at TWO layers: Director declares `Image 1/2/3 =` labels in the prompt body (section 3); the `/generate-openai` route injects additional role directives at API call time. Both layers reinforce each other.

---

## 13. Checklist (pre-generation)

Before finalizing any OpenAI Master Prompt:

- [ ] Structure: Scene → Subject → Details → Typography → Constraints
- [ ] Text: quoted exactly, typography specified, "no extra text" constraint added
- [ ] Lighting: named explicitly (not "good lighting")
- [ ] Materials: specific textures and surfaces (not "nice materials")
- [ ] Constraints: what must NOT change or appear
- [ ] Quality: `low` for iteration, `high` for final
- [ ] Resolution: edges multiples of 16, ratio ≤ 3:1, total pixels ≤ 8.29M
- [ ] Format: PNG for transparency, JPEG for photos, WebP for web
- [ ] Edits: preserve list stated, Image 1/2/3 labels in prompt body, `input_fidelity: high` if identity matters
