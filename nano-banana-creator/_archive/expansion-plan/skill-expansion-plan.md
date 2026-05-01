---
name: nano-banana-skill-expansion-plan
description: Detailed plan for expanding the Nano Banana Creator skill system — new agents, agent expansions, and architecture improvements informed by awesome-agent-skills and awesome-claude-skills ecosystem best practices.
type: project
---

# Nano Banana Skill Expansion Plan

**Why:** The current 6-agent skill system generates cinematic image prompts for iSupply AI Studio but has clear gaps: no copy output, no male model support, no indoor settings, no structured repair workflow, no video mode, and a monolithic SKILL.md architecture that loads everything at once.

**How to apply:** Use this plan when adding, modifying, or expanding agents in the nano-banana-creator skill. Build in the order listed unless specified otherwise.

---

## Architecture Improvements (apply to all changes)

### 1. Progressive Disclosure
Current SKILL.md is ~650 lines loaded at once. Best practice from ecosystem (Sentry, WordPress, Expo skills): agents should load their section only when called. The Director already does this conceptually ("Read `references/agent-intelligence.md` → AGENT 2 section"), but the main SKILL.md itself should be leaner up top with heavier content in reference files.

### 2. Each Agent = Addressable Unit
The best skills (Sentry, WordPress, Expo) break into focused, routable sub-skills. Right now all 6 agents live in one file. Splitting agent definitions into individual reference files would let the system load only what's needed and reduce token cost.

---

## New Agents to Build

### Agent 7 — Copy/Caption Creator (highest ROI)
Every campaign image needs platform copy. This agent reads the Creative Brief + final Master Prompt and outputs:
- **IG caption** — hook + body + CTA + hashtags
- **TikTok caption** — short hook + trending format
- **E-commerce alt text** / product description
- **Story/Reel text overlay** suggestions

Pattern: follows the same "read intelligence file → produce block → Director stitches" flow. Modeled after Corey Haines' `social-content` + `copywriting` skills but specialized for visual campaign output.

Director integration: new Step 11 after stitching — run Agent 7, output Copy Block at the end of the delivery package.

Output format:
```
### ✍️ Copy Block
→ PASTE INTO: your platform caption field

**Instagram Caption:**
[hook line]
[body — 2-3 sentences]
[CTA]
[hashtag block — 15-20 relevant tags]

**TikTok Caption:**
[short hook — under 150 chars]

**E-commerce Alt Text:**
[accessible, SEO-friendly image description — 1-2 sentences]

**Story/Reel Overlay Text:**
[3-5 word overlay suggestion per frame]
```

### Prompt Repair Agent (Agent 5.5 or Director Extension)
When generation fails or looks wrong → structured diagnostic workflow. Beyond the current troubleshooting table in agent-intelligence.md.

Pattern from Trail of Bits' `differential-review` skill — analyze what changed, what broke, what to fix.

Workflow:
1. User describes what's wrong ("skin too smooth", "product wrong color", "background doesn't match")
2. Agent diffs the prompt against the intelligence file checklist
3. Categorizes the failure (anatomy / lighting / product / skin / composition / filter rejection)
4. Outputs a corrected prompt with annotations explaining each fix
5. Suggests parameter tweaks (temp, seed, top_p) specific to the failure type

Failure categories and fix patterns:
| Category | Diagnostic Question | Fix Pattern |
|---|---|---|
| Skin too smooth/plastic | Missing anti-plastic phrases? | Add from Agent 2 intelligence |
| Wrong product | Description ambiguous? Reference image missing? | Strengthen negative language, add ref image |
| Background mismatch | Plate angle vs prompt angle? | Camera angle audit, OVERRIDE flag |
| Lighting flat | Missing lighting formula? | Rebuild with FIRST principle |
| Filter rejection | Body-adjacent language? | Run Strategy 1-8 from content filter guide |
| Anatomy errors | Hand/finger description vague? | Add explicit finger count + joint language |
| Color wrong | White balance unspecified? | Add exact color temp in K |
| Too generic/AI-looking | Humanizer pass skipped? | Run banned patterns check |

---

## Existing Agent Expansions

### Agent 2 — Male Model + Group Shot Support
Current Agent 2 is almost entirely built around female models. Missing:

**Male model additions:**
- Male pose vocabulary library (power stance, relaxed lean, seated authority, active/sport)
- Male outfit fabric specificity guide (suiting fabrics, streetwear layers, activewear)
- Male grooming descriptors (facial hair types, hair texture/style, skin specifics)
- Male expression vocabulary (beyond "confident" — composed, focused, contemplative, candid laugh)
- Male Fitzpatrick scale examples (same 3-part skin formula, adjusted examples)

**Group shot support:**
- 2-model composition rules (foreground/background depth, gaze direction interplay)
- 3-model arrangements (triangle composition, staggered depth, editorial line)
- Couple/interaction poses for lifestyle campaigns (natural touch points, gaze connection)
- ModelCreationNode composite format for multi-model (already partially defined — 2 models = 4-panel 21:9, 3 models = 6-panel 21:9)

### Agent 3 — Indoor Settings Precision Guide
Beach and urban are well-covered in agent-intelligence.md. Missing indoor environments:

**Home/lifestyle:**
- Window light mixing with practical lamps (mixed color temp — 5500K window + 2700K tungsten)
- Depth layers: foreground (sofa arm, plant), midground (model + product), background (bookshelf, window)
- Surface textures: wood grain, linen upholstery, ceramic, marble countertop

**Studio:**
- Strobe lighting setups (beauty dish, octabox, strip light)
- Seamless paper backgrounds (color selection by brand mood)
- Product-on-surface studio (marble slab, wood block, draped fabric)

**Café/restaurant:**
- Ambient mixed with candlelight (warm 2200K + overhead 3500K)
- Bokeh from background patrons and hanging lights
- Table surface: marble, dark wood, zinc, tile

**Hotel room / luxury interior:**
- Warm editorial bedroom (linen sheets, morning light through sheer curtains)
- Bathroom editorial (marble, brass fixtures, soft overhead)
- Balcony/terrace (indoor-outdoor transition, backlit doorframe)

### Agent 5 — Video/Motion Prompt Mode
Gemini's video generation is growing. Add a mode switch to Agent 5's responsibilities:

**Static mode** → current behavior (no change)

**Motion mode** → new parameters:
- Frame rate recommendation (24fps cinematic, 30fps social, 60fps slow-mo)
- Movement description language: subject motion (walking, turning, hair flip, product application)
- Camera motion vocabulary: dolly in/out, pan L/R, tilt up/down, rack focus, static lock
- Transition logic for carousel-to-reel conversion
- Duration targeting (3s, 6s, 15s, 30s)
- Loop-friendly composition (start frame ≈ end frame for IG Reels loop)

API config additions for motion:
```
[API: model=gemini-X-video, temp=X, seed=X, fps=24, duration=6s, camera=dolly-in]
```

---

## Brand Library Management System
Current `brand-context.md` is a flat file. Expand to support:

- **Campaign-tagged sections** (Summer 2026, Studio Series, Holiday Drop)
- **Product line profiles** (skincare line, tech line, food line — each with own material matrix)
- **Model roster** (saved model descriptions for consistent re-use across shoots — name, Fitzpatrick, key features, composite asset tags)
- **Setting presets** (saved plate descriptions the Director can reference by name — "Boracay Golden Hour", "Manila Studio A", "Nipa Hut Interior")

Template structure:
```markdown
# Brand Library — [Brand Name]

## Active Campaign: [Campaign Name] (date range)
[campaign-specific overrides: color palette, mood, tagline]

## Product Lines
### [Line Name]
[products, materials, key visual features, tags]

## Model Roster
### [Model Nickname]
[full Agent 2 description, Fitzpatrick, composite asset tags]

## Setting Presets
### [Preset Name]
[full Agent 3 setting block, SettingNode config, tags]
```

---

## Build Priority Order
1. Agent 7 — Copy Creator (completes the end-to-end campaign workflow)
2. Agent 2 expansion — Male models + group shots (unblocks 50% of real campaign needs)
3. Agent 3 expansion — Indoor settings (unblocks studio/home/café shoots)
4. Prompt Repair Agent (reduces iteration time on failed generations)
5. Agent 5 — Video mode (future-proofing for Gemini video)
6. Brand Library system (organizational improvement, not blocking any workflow)
7. Architecture refactor — split SKILL.md into progressive-disclosure sub-files (do last, after content is stable)
