# Nano Banana Creator

A 9-agent prompt engineering system for generating cinematic, photorealistic AI images and videos using Google's Gemini image generation (Nano Banana) and Veo models.

---

## What It Does

You give it a request — "I want a model at the beach with our SPF serum" — and it produces a complete, ready-to-use delivery package: a fully engineered Master Prompt, API configuration, working code (JS + Python), paired captions for IG/TikTok/e-comm, and a repair path if anything fails.

It is not a prompt template. It is a pipeline where 9 specialized agents each handle one layer of the problem — creative direction, human model description, environment and lighting, product accuracy, API routing, master orchestration, copywriting, and failure diagnosis — and the Director agent stitches them together.

---

## The 9 Agents

| # | Agent | What it does |
|---|---|---|
| 0 | **Brand DNA** | Runs a guided Q&A to extract your brand's visual identity — colors, lighting signature, mood words, anti-vocabulary. Writes `brand-context.md` with a named token schema that every other agent pulls from. |
| 1 | **Concept Creator** | Expands your raw request into a full creative brief — content type, aesthetic direction, mood, narrative. Uses a 40+ content taxonomy and sensory marketing principles. Anti-generic: it picks one direction and commits. |
| 2 | **Human Model Creator** | Defines the photorealistic human subject across 6 dimensions: skin tone (Fitzpatrick formula), facial features, hair, body type, expression/energy, outfit. Bans AI-default "plastic" phrasing. |
| 3 | **Setting Creator** | Builds the environment and lighting. Lighting is always specified FIRST — source, direction, temperature, quality. Pulls from a time-of-day library, environment taxonomy, and sensory setting vocabulary. |
| 4 | **Product Accuracy** | Writes a surgical product description: material, reflectivity, label legibility, color accuracy, placement logic. Enforces material honesty (matte stays matte, glossy has specular highlights). 10 product content type rules. |
| 5 | **Supervisor** | Routes the task (generate / edit / compose / upscale / restore / video / try-on), selects the right model, tunes Temperature → top_p → top_k in correct order, sets seed strategy, checks API compliance. |
| 6 | **Director** | Master orchestrator. Runs agents 1–5, cross-checks consistency (skin tone vs. lighting, outfit vs. setting, product scale vs. model's hands), runs the humanizer pass, prepends the `[API:]` tag, and stitches the final delivery package. Formats output differently per workflow mode. |
| 7 | **Copy Creator** | Generates platform-specific copy: Instagram caption + hashtags, TikTok hook, e-commerce product description, alt text, story overlay text. Integrates brand voice from `brand-context.md`. |
| 8 | **Prompt Repair** | When a generation fails or looks wrong — takes the failed prompt + the problem description → runs a 10-category differential review → outputs a targeted repair, not a full rebuild. |

---

## Full Delivery Package (every run)

1. **Creative Brief Summary** — scene context
2. **Model Block** — 6-dimension photorealistic model description
3. **Setting Block** — environment + lighting (lighting first)
4. **Product Block** — product description with accuracy tags
5. **Master Prompt** — the final stitched prompt, ready to paste anywhere
6. **API Configuration** — model, temperature, top_p, top_k, seed
7. **Ready-to-Run Code** — JS and Python snippets for direct Gemini API calls
8. **Seed Exploration Guide** — seed offset variants (+1, +7, +13, +35, +58) with expected composition changes
9. **Copy Block** *(optional, invoke Agent 7)* — IG / TikTok / e-comm / alt text / story overlay

---

## How the Intake Works

Every session starts with a 2-gate handshake before any work begins. Both gates are skippable when the answer is already known.

### Gate 1 — Workflow Mode

The skill asks where you'll use the output:

1. **iSupply AI Studio** — node canvas workflow
2. **Direct API** — Gemini API via JS or Python code
3. **Google AI Studio** — aistudio.google.com web interface
4. **Generic** — any other tool

The answer changes how the entire output is formatted (see Workflow Modes below). Your answer is saved to `.workflow-mode` so you're never asked again in the same project.

**Auto-skipped if:** you mention iSupply/API/AI Studio in your first message, `.workflow-mode` already exists, or your host app passed the mode in system context.

### Gate 2 — Brand DNA

After Gate 1:

- **A. Load existing** — paste your brand-context.md or point to the file
- **B. Build one now** — 5-minute guided Q&A with Agent 0, produces dramatically better output
- **C. Skip** — proceed without brand context (results will be more generic)

**Auto-skipped if:** `brand-context.md` exists in the project directory (loads silently), or you include brand details inline in your first message.

### Gate 3 — Guided Q&A (only if request is vague)

Only fires if, after Gates 1 and 2, the actual task is still ambiguous. Agent 1's Pre-Shoot Brief surfaces as 2–3 targeted questions. Skipped entirely if you gave a concrete request.

---

## Workflow Modes — What Changes Per Mode

### Mode: `isupply`

Output is formatted for iSupply AI Studio's node canvas. Every block gets an explicit paste target. The `[API:]` tag on line 1 of the Master Prompt auto-fills the node's settings panel and is stripped before sending to Gemini.

Full iSupply workflow is covered separately below.

### Mode: `api-direct`

Output emphasizes the Ready-to-Run Code block. Includes:
- Full JS snippet using `@google/generative-ai`
- Full Python snippet using `google-generativeai`
- Reference image handling via `inlineData`
- `responseModalities: ["IMAGE"]` shown explicitly
- Parameters set in code — no `[API:]` tag in the prompt

### Mode: `ai-studio`

Master Prompt is a clean single block (no `[API:]` tag). A separate **"AI Studio Settings Panel"** block lists every parameter to type into the sidebar manually:

```
AI Studio Sidebar Settings:
  Model: gemini-3.1-flash-image-preview
  Temperature: 1.0
  Top P: 0.97
  Top K: 40
  Seed: 42
  Response Modalities: ✅ IMAGE
```

### Mode: `generic`

Tool-agnostic default. All blocks output without paste targets — you route them yourself.

---

## Using This From Any Chat Interface

### Option A — Direct invocation (no host app integration)

Just invoke the skill from any Claude interface. The gates run interactively and collect what they need via conversation. Works in Claude Code, Claude.ai, or any Claude-backed chat app that loads this skill.

### Option B — Host app integration (bypass the gates)

If you're building a chat interface that wraps this skill, pass these context values in the system prompt or tool context and the skill skips directly to the Director:

```json
{
  "workflow": { "mode": "isupply" | "api-direct" | "ai-studio" | "generic" },
  "brand": {
    "hasContext": true,
    "contextPath": "/path/to/brand-context.md"
  },
  "skip_gates": ["workflow_mode", "brand_dna"]
}
```

When those values are present, no questions are asked. The Director loads the brand context and proceeds.

### What the skill can be invoked for

- Generate a new image — model + product + setting
- Edit an existing image (color change, element removal, background swap)
- Animate a still into an 8-second video (Veo 3)
- Upscale or restore a low-quality image
- Virtual try-on (garment on person)
- Product-in-scene compositing
- Multi-slide carousel with consistent character/product across slides
- Brand DNA setup from scratch
- Writing platform captions + alt text
- Diagnosing and repairing a failed or rejected generation

---

## Using This With iSupply AI Studio

iSupply AI Studio is a node canvas. You build a scene by connecting nodes — each node does one job, and canvas edges pass outputs between them.

### The Nodes

| Node | What you do with it | Nano Banana Creator output that goes here |
|---|---|---|
| **UploadNode** | Upload a reference photo (product, model face, saved background plate) and tag it | Product Block → use the tag keywords listed |
| **ModelCreationNode** | Generates a multi-panel model reference sheet (front · 3/4 · side · back) | Model Block → paste into the Description field |
| **SettingNode** | Generates a background plate (single or multi-angle) | Setting Block → paste in; choose Standard or Multi-Angle mode |
| **PromptNode** | Final scene generation | Master Prompt → paste in; `[API:]` tag on line 1 auto-fills settings |
| **CarouselPromptNode** | Per-slide generation for carousels | One per slide; paste each slide's Master Prompt |
| **OutputNode** | Displays output + Seed Explorer | Enter your base seed; app generates +1, +7, +13, +35 grid automatically |

### Standard 5-Step Workflow (single image)

```
STEP 1 — Upload product reference photo
         → UploadNode → set tags from Product Block

STEP 2 — Generate model reference sheet
         → ModelCreationNode → paste Model Block into Description field

STEP 3 — Generate background plate
         → SettingNode → paste Setting Block

STEP 4 — Connect canvas edges:
         UploadNode(product) ──▶ PromptNode
         ModelCreationNode ─────▶ PromptNode
         SettingNode ──────────▶ PromptNode

STEP 5 — Generate the scene
         → PromptNode → paste Master Prompt
         → Line 1 [API:] tag auto-fills model, temperature, seed

STEP 6 — Explore variants
         → OutputNode Seed Explorer → enter base seed
         → app generates +1, +7, +13, +35 grid
```

### The `[API:]` Tag

Line 1 of every iSupply Master Prompt is an auto-fill tag:

```
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42]
```

iSupply AI Studio reads this tag, fills in the node's settings panel, and strips the tag before sending the prompt to Gemini. You never need to set parameters manually.

SettingNode uses a different format (lower temperature for plate consistency):

```
[API: temp=0.6, seed=42]
```

### Tag Auto-Matching (UploadNode ↔ PromptNode)

For reference images in UploadNode to auto-pull into a PromptNode generation, tag keywords on the UploadNode asset must appear verbatim somewhere in the Master Prompt.

**Product reference tags:**
```
Tags: [product name], [product type], [key material], [key color], [brand]
Example: isupply-pro-2, earbuds, glossy white, stem-style, wireless, iSupply
```
Then the Master Prompt must include those exact words: `"the iSupply Pro 2 earbuds — glossy white stem-style wireless earbuds…"`

**Model face reference tags:**
```
Tags: [identity name], [ethnicity], [age range], [distinctive feature], [gender]
Example: maya-v1, filipina, mid-twenties, freckles, female
```

**Saved background plate tags:**
```
Tags: [location type], [time of day], [mood], [angle label]
Example: coastal-beach, golden-hour, warm-editorial, interior-looking-outward
```

**Hard limit:** Max 14 reference images per generation. Each image ≤ 1024px JPEG q85. Order matters — most important image first (product → model → setting).

### Carousel Workflow

```
STEP 1 — Upload product photo → UploadNode → tag it
STEP 2 — Generate model composite → ModelCreationNode → paste Model Block
STEP 3 — Generate primary plate → SettingNode → paste Setting Block
STEP 3b — If any slide has [PLATE: NEW] flag:
          Generate second plate → second SettingNode → second Setting Block
STEP 4 — Draw edges:
          UploadNode → all CarouselPromptNodes
          ModelCreationNode → all CarouselPromptNodes
          SettingNode(primary) → slides flagged [PLATE: PRIMARY] and [PLATE: OVERRIDE]
          SettingNode(new) → slides flagged [PLATE: NEW]
STEP 5 — Create one CarouselPromptNode per slide → paste each slide's Master Prompt
STEP 6 — Output carousel → OutputNode
```

Every carousel slide uses the same `[API:]` seed — seed consistency is how character and product stay visually locked across slides.

### Plate Flags (carousel only)

Every slide in a carousel output gets one of three flags:

**`[PLATE: PRIMARY]`** — camera angle matches the primary SettingNode plate. Connect primary plate, no extra work needed.

**`[PLATE: OVERRIDE — inline setting included]`** — camera faces a different direction than the primary plate. Director embeds a brief setting description directly in the slide's Master Prompt for spatial grounding. Still connect the primary plate for lighting/color continuity.

**`[PLATE: NEW — second SettingNode required]`** — completely different environment or lighting. Director outputs a second Setting Block. Create a second SettingNode, connect it only to the flagged slides.

### iSupply Checklist (before generating)

- [ ] Product reference photo uploaded to UploadNode with correct tags
- [ ] If model consistency needed: face reference uploaded to UploadNode
- [ ] ModelCreationNode created and connected to PromptNode
- [ ] SettingNode created and connected to PromptNode
- [ ] All Master Prompt tag keywords match UploadNode asset tags
- [ ] Seed locked (same seed across all carousel slides)

---

## Brand Context File (`brand-context.md`)

The brand context uses a **token schema** — every visual identity element is a named, reusable token. Agents pull only the tokens they need without re-interpreting the brand each time.

Key tokens: `brand.personality`, `color.primary`, `color.accent`, `lighting.signature`, `anti-vocabulary`, `audience.aspiration`, `photography.style`, `pose.energy`.

Agent 0 runs a 4-block guided Q&A to extract these tokens, then runs a mini eval loop — generates a test prompt using the tokens, checks it matches brand intent, and adjusts before writing the file. Once `brand-context.md` exists, the Director loads it automatically at the start of every session.

---

## File Structure

```
nano-banana-creator/
├── SKILL.md                              ← 9-agent orchestrator + First-Touch Intake Protocol
├── branded-ai-guide.html                 ← mobile visual reference
├── brand-context.md                      ← written by Agent 0 (your file, created on first run)
├── .workflow-mode                        ← written after Gate 1 (persists mode choice)
├── agents/
│   ├── agent-0-brand-dna/SKILL.md
│   ├── agent-1-concept-creator/SKILL.md
│   ├── agent-2-human-model-creator/SKILL.md
│   ├── agent-3-setting-creator/SKILL.md
│   ├── agent-4-product-accuracy/SKILL.md
│   ├── agent-5-supervisor/SKILL.md
│   ├── agent-6-director/SKILL.md
│   ├── agent-7-copy-creator/SKILL.md
│   └── agent-8-prompt-repair/SKILL.md
└── references/
    ├── agent-intelligence.md             ← skin formulas, lighting library, material matrix, etc.
    ├── api-reference.md                  ← Nano Banana + Veo API parameters + code examples
    ├── prompt-patterns.md                ← scene templates, product description templates
    └── isupply-mode.md                   ← iSupply node workflow reference (loaded for isupply mode only)
```

---

## Quick Reference — Which Agent Handles What

| Request | Routes to |
|---|---|
| "Set up my brand" / no brand-context.md | Agent 0 |
| "Generate an image of…" / photoshoot | Agent 6 → runs 1–5 |
| "Write captions for this" / alt text / hashtags | Agent 7 |
| "This came out wrong" / "fix this prompt" / "skin looks plastic" | Agent 8 |
| "Edit this image" / upscale / remove background / animate | Agent 5 (task router) |
| "Generate a carousel" / multi-slide campaign | Agent 6 with carousel mode |
