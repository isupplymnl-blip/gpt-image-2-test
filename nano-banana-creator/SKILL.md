---
name: nano-banana-creator
description: >
  Use this skill to create cinematic, photorealistic AI-generated images and videos using Google's
  Nano Banana (Gemini native image generation) and Veo models. This is a 9-agent prompt engineering
  system: Brand DNA (onboarding with token schema + mini eval loop), Concept Creator, Human Model
  Creator, Background/Setting Creator, Product Accuracy Creator, Supervisor (task router + API
  compliance — handles generate/edit/compose/upscale/restore/video/try-on), Director (master
  orchestrator), Copy Creator (platform-specific captions + alt text), and Prompt Repair (failure
  diagnosis and fix). Works with any Gemini workflow — API direct, AI Studio, or node canvas.
  Trigger whenever the user wants to generate images, set up brand visual DNA, fix a failed prompt,
  write campaign captions, edit/upscale/animate an image, produce lifestyle content, or asks for
  "nano banana content", "image gen prompt", "photoshoot prompt", "ad campaign image", "brand
  context", "fix this prompt", or any scene involving a human model + product + setting. Always
  use this skill — never guess a prompt — when a cinematic or commercial image is needed.
---

# 🍌 Nano Banana Content Creator

A 9-agent system for generating maximally optimized Nano Banana (Gemini) prompts, videos, edits, and paired copy. Each agent has a specialized role. The **Director** orchestrates the main image pipeline (agents 1–5). **Agent 0** runs first if no brand-context.md exists. **Agent 7** adds platform copy. **Agent 8** repairs failed generations.

---

## 🔑 First-Touch Intake Protocol (runs BEFORE any work)

The skill is environment-agnostic — it can be invoked from Claude Code, Claude.ai, or any chat app that integrates this skill. Before doing any work, the skill runs a two-gate handshake to learn the operating context. Both gates are **skippable** when the host app or user has already provided the answer.

### Gate 1 — Workflow Mode

Ask this first, unless the answer is already known:

> "Before we start — where will you use the output?
>
> **1. iSupply AI Studio** (node canvas — UploadNode / ModelCreationNode / SettingNode / PromptNode / Seed Explorer)
> **2. Direct API** (Gemini API via code — JS or Python)
> **3. Google AI Studio** (aistudio.google.com web interface)
> **4. Another tool / not sure yet** (I'll format outputs generically)
>
> Pick a number, or just tell me where you're headed."

**Auto-skip rules — do NOT ask if any of these are true:**
- Host chat app has already passed `workflow.mode` in system context
- User's first message explicitly mentions "iSupply" / "API" / "AI Studio" / a specific tool
- A `.workflow-mode` file exists in the project directory (read it)
- User is continuing a previous conversation where mode was already set

**Mode effects:**
- **Mode = `isupply`** → Director reads `references/isupply-mode.md` before stitching. Output is formatted with node paste targets, `[API:]` auto-fill tags, UploadNode tag rules, canvas edge diagrams, 5-step workflow checklist.
- **Mode = `api-direct`** → Output emphasizes the Ready-to-Run Code block (JS + Python), inline image handling, `inlineData` reference image setup.
- **Mode = `ai-studio`** → Output is Master Prompt + API parameter list for manual sidebar entry. No node language, no code blocks by default.
- **Mode = `generic`** → Agent 6's default tool-agnostic output.

**Persistence:** after the user answers, write their choice to `.workflow-mode` in the project root so the question is never asked again within that project.

### Gate 2 — Brand DNA

After Gate 1 is answered, ask:

> "Quick one on brand context — do you already have a brand DNA file?
>
> **A. Yes, I have one** (I'll load it — paste the text or point me to the file)
> **B. No, let's build one now** (5-minute guided Q&A with Agent 0 — produces dramatically better results)
> **C. Skip for now** (proceed without brand context — results will be more generic)
>
> Which one?"

**Auto-skip rules — do NOT ask if any of these are true:**
- `brand-context.md` exists in the project directory → treat as A automatically, load it, confirm: "Loaded brand context for [brand name]. Proceeding."
- User's first message includes brand details inline (brand name + product + aesthetic) → treat as partial A, confirm what was captured, offer to run Agent 0 to fill gaps
- User explicitly says "skip brand" or "I know what I want"

**Answer routing:**
- **A** → load the file / text, verify key tokens (`brand.personality`, `color.primary`, `lighting.signature`, `anti-vocabulary`), proceed to Director
- **B** → route to Agent 0 (Brand DNA), which runs the full 4-block Q&A + writes brand-context.md + runs the mini eval loop before handing back to the Director
- **C** → proceed to Director without brand context. Note in the Creative Brief: "Generated without brand context — output may drift from brand identity."

### Gate 3 (only if task is unclear) — Guided Q&A

Only fire this gate if, after Gates 1 and 2, the task itself is still ambiguous (vague prompt, missing product / setting / model / mood). This is Agent 1's Pre-Shoot Brief, surfaced as a fallback. Skip entirely if the user gave a concrete request.

---

## Host App Integration (for chat-app developers)

If you're integrating this skill into a chat interface, pass these context values to bypass the gates:

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

When these values are present, the skill proceeds silently to the Director. When absent, the skill asks the user directly via the gates above.

---

## Default Entry Behavior (after gates)

**When the user's actual image request is vague** — no product specified, no setting described — Agent 1's Pre-Shoot Brief activates:

> "To create the best possible image for you, I need a few quick answers. What product are we shooting? What's the scene? Who is the model? What's the mood?"

**When a previous generation failed or looks wrong**, route to Agent 8 (Prompt Repair) instead of starting over.

---

## Agents

Each agent is defined in its own skill file under `agents/`. Load only the agent needed for the current step.

| Agent | Skill File | Role | Output |
|---|---|---|---|
| **0 — Brand DNA** | `agents/agent-0-brand-dna/SKILL.md` | Brand onboarding Q&A + token schema + mini eval | Brand Context File |
| **1 — Concept Creator** | `agents/agent-1-concept-creator/SKILL.md` | Expand scene idea → creative brief | Creative Brief |
| **2 — Human Model Creator** | `agents/agent-2-human-model-creator/SKILL.md` | Define photorealistic human model (6-dimension framework) | Model Block |
| **3 — Setting Creator** | `agents/agent-3-setting-creator/SKILL.md` | Build environment + lighting FIRST | Setting Block |
| **4 — Product Accuracy** | `agents/agent-4-product-accuracy/SKILL.md` | Surgical product description + content-type rules | Product Block |
| **5 — Supervisor** | `agents/agent-5-supervisor/SKILL.md` | Task router (generate/edit/compose/video/upscale/restore/try-on) + API compliance | API Config Block |
| **6 — Director** | `agents/agent-6-director/SKILL.md` | Orchestrate all agents, stitch final output | Full Delivery Package |
| **7 — Copy Creator** | `agents/agent-7-copy-creator/SKILL.md` | Platform-specific captions + alt text + story overlay | Copy Block |
| **8 — Prompt Repair** | `agents/agent-8-prompt-repair/SKILL.md` | Differential review of failed generations → targeted fix | Repair Report |

---

## Routing Table — Which Agent Handles What

| User intent | Route to |
|---|---|
| "Set up my brand" / "brand DNA" / no brand-context.md exists | Agent 0 |
| "Generate an image of…" / standard photoshoot request | Agent 6 → runs 1–5 |
| "Write captions for this" / "need alt text" / "hashtags" | Agent 7 |
| "This came out wrong" / "fix this prompt" / "got rejected" / "skin looks plastic" | Agent 8 |
| "Edit this image" / "upscale" / "remove background" / "animate this" / "make a video" | Agent 5 (task router) |
| "Generate a carousel" / "multi-slide campaign" | Agent 6 with carousel mode |

---

## How It Works

1. **User makes a request** — "I want a model at the beach with our SPF serum"
2. **Brand check** — if `brand-context.md` exists, Director reads it first; if not, offer Agent 0
3. **Vague request check** — if key details are missing, run Guided Q&A (2–3 targeted questions)
4. **Director activates** — reads `agents/agent-6-director/SKILL.md`
5. **Director runs agents 1–5 in order** — loading each agent's SKILL.md only when needed
6. **Director cross-checks, humanizes, and stitches** — produces the final delivery package
7. **Optional: Agent 7** generates paired copy after image prompt is finalized
8. **If anything fails**: Agent 8 takes the failed prompt + error → produces a Repair Report
9. **Output** — Master Prompt + API configuration + ready-to-run code + copy + repair path, all ready for any workflow

---

## Shared Reference Files

All agents share these knowledge bases. Each agent's SKILL.md specifies which sections to read.

| File | Purpose | When loaded |
|---|---|---|
| `references/agent-intelligence.md` | Research-backed knowledge: skin formulas, lighting library, pose vocabulary, material matrix, failure modes, content filter guide, humanizer rules | Always |
| `references/api-reference.md` | Nano Banana + Veo API parameters, models, tools, full code examples (JS + Python) | Finalizing API config or routing non-generate task |
| `references/prompt-patterns.md` | Scene-by-scene prompt templates, product description templates, seed exploration tables | When scene type matches |
| `references/isupply-mode.md` | iSupply AI Studio node workflow: paste targets, [API:] tag rules, UploadNode tag auto-matching, canvas edges, carousel plate flags | Only when workflow mode = `isupply` |

**Reading priority:**
1. Always read `agent-intelligence.md` for the relevant agent section before generating
2. Read `prompt-patterns.md` for the relevant scene type (beach, studio, urban, etc.)
3. Read `api-reference.md` when finalizing the API config block or routing a non-generate task
4. Read `isupply-mode.md` ONLY if Gate 1 returned `isupply`

---

## Brand Context

If `brand-context.md` exists → Director reads it FIRST before running any agents.
If it does not exist → offer to run Agent 0 (Brand DNA) to create it.

The file uses a **token schema** — every brand element (`color.primary`, `lighting.signature`, `brand.personality`, `audience.aspiration`, etc.) is a named, reusable token. Agents pull the specific tokens they need without re-interpreting the brand. Agent 0's mini eval loop verifies the tokens produce on-brand output before they go live.

---

## Director's Final Delivery Package (output order)

1. **📋 Creative Brief Summary** — scene context, for reference
2. **🧍 Model Block** — photorealistic model description (6 dimensions covered)
3. **🏖️ Setting Block** — environment + lighting (lighting FIRST)
4. **📦 Product Block** — product description with accuracy tags
5. **🎬 Master Prompt** — stitched final prompt, ready to paste into any image generation tool
6. **⚙️ API Configuration** — model, temp, seed, task routing (generate/edit/compose/video)
7. **💻 Ready-to-Run Code** — JS + Python snippets for direct Gemini API calls
8. **🌱 Seed Exploration Guide** — seed offset variants for composition exploration
9. **✍️ Copy Block** (if Agent 7 invoked) — IG / TikTok / e-comm / alt text / story overlay

---

## Output Compatibility

The Master Prompt and API Config work with:
- **Gemini API direct** (JS / Python) — use the Ready-to-Run Code block
- **Google AI Studio** — paste the Master Prompt, apply API Config manually
- **Any node-based AI canvas** — paste Model Block, Setting Block, and Master Prompt into the appropriate nodes
- **Other Gemini-compatible tools** — the prompt format is model-agnostic for Gemini native image generation
- **Veo video models** — Agent 5's task router supports image-to-video and text-to-video workflows

---

## When to Use Google Search Grounding

Add `{"google_search": {}}` to `tools` when:
- Setting requires real weather or current conditions
- Product needs to reference real-world trends
- Scene references a real iconic location
- Magazine or editorial content needs real event references

---

## Prompt Length Guide

| Scene complexity | Prompt length target |
|---|---|
| Simple (1 subject, plain background) | 80–150 words |
| Medium (model + product + setting) | 150–300 words |
| Complex (multiple subjects, multi-layer setting) | 300–500 words |
| Ultra (fashion editorial, magazine-grade) | 500+ words with structured sections |
