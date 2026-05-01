# How to Build Agents & Skills — Reference Guide

Distilled from:
- `awesome-agent-skills` (1100+ official skills from Anthropic, Google, Vercel, Stripe, Expo, etc.)
- `awesome-claude-skills` (Claude-specific skill ecosystem and official docs)

---

## What Is a Skill?

A skill teaches an AI agent how to **perform a task in a repeatable way**. It's a folder containing instructions, optional scripts, and optional resources that the agent discovers and loads when relevant.

Skills are NOT prompts. Prompts are one-time instructions. Skills are **portable, version-controlled expertise** that work across conversations and can be shared, composed, and stacked.

---

## Skill Folder Structure

```
my-skill/
├── SKILL.md              # Main skill file — frontmatter + instructions
├── references/            # Supporting knowledge files (loaded on demand)
│   ├── intelligence.md    # Deep knowledge base for agents
│   ├── api-reference.md   # API docs, parameters, code examples
│   └── patterns.md        # Templates, examples, proven patterns
├── scripts/               # Optional executable scripts
│   └── helper.py
└── resources/             # Optional static resources
    └── template.json
```

**The only required file is `SKILL.md`.** Everything else is optional.

---

## SKILL.md Format

```yaml
---
name: my-skill-name
description: >
  One paragraph that explains WHEN to trigger this skill. This is used for
  skill discovery — the AI scans this to decide if the skill is relevant.
  Keep it specific and action-oriented. Include trigger phrases the user
  might say.
---

# Skill Title

[Full instructions go here — this is loaded when the skill activates]
```

### Frontmatter Rules
- **`name`** — kebab-case, unique, descriptive (e.g. `nano-banana-creator`, `stripe-best-practices`)
- **`description`** — the MOST important field. This is what the AI reads to decide relevance. Include:
  - What the skill does
  - When to trigger it (user phrases, keywords, scenarios)
  - What it does NOT do (prevents false activation)

### Description Examples (good vs bad)

**Bad:** "A skill for creating images" (too vague, triggers on everything)

**Good:** "Use this skill to create cinematic, photorealistic AI-generated images using Gemini native image generation. Trigger when the user wants to generate images of a product with a model, create commercial photography prompts, or produce lifestyle content."

---

## Progressive Disclosure Architecture

This is the #1 pattern that separates good skills from bad ones. It's how skills stay efficient with tokens:

### Layer 1 — Metadata (~100 tokens)
The AI scans the `name` and `description` frontmatter of ALL available skills to find relevant matches. This happens on every user message. Keep it tiny.

### Layer 2 — Full Instructions (<5K tokens)
When the AI determines a skill is relevant, it loads the full SKILL.md body. This should contain:
- Agent roles and responsibilities
- Workflow steps
- Output formats
- Rules and constraints

### Layer 3 — Bundled Resources (on demand)
Reference files, scripts, and resources load ONLY when an agent explicitly needs them. This is why the Nano Banana skill says "Read `references/agent-intelligence.md` → AGENT 2 section" — it doesn't load the whole file upfront.

**Token impact:**
- Without progressive disclosure: 10K-50K tokens loaded always
- With progressive disclosure: ~100 tokens always, rest on demand

---

## How to Build an Agent (within a skill)

An agent is a specialized role within a skill. Each agent has:

1. **Role** — one sentence defining what it does
2. **Reading list** — which reference files/sections to load before running
3. **Responsibilities** — specific tasks it must complete
4. **Output** — exactly what it produces (named block with format)

### Agent Template

```markdown
### Agent N — [Name]
**Role:** [One sentence — what this agent does]

**Read `references/[file].md` → "[section name]" before proceeding.**

Responsibilities:
- [Specific task 1]
- [Specific task 2]
- [Specific task 3]

Output: **[Block Name]** ready to embed in [destination]
```

### Agent Design Rules (from ecosystem best practices)

1. **Single responsibility** — each agent does ONE thing well. If an agent has two unrelated jobs, split it.
2. **Explicit reading list** — always tell the agent exactly which file and section to read. Never assume knowledge.
3. **Named output** — every agent produces a named block (Model Block, Setting Block, API Config Block). The orchestrator (Director) references these by name.
4. **Cross-check points** — agents that produce related outputs must cross-check. Product must match setting. Model outfit must match environment. Lighting must match time of day.
5. **Failure modes** — document what goes wrong and how to fix it. Every agent should have a "common mistakes" section.

---

## How to Build a Multi-Agent Skill

The Nano Banana Creator is a multi-agent skill with an orchestrator (Director). This is the most complex skill pattern.

### The Orchestrator Pattern

```
User Request
    ↓
Orchestrator (Director)
    ├── Runs Agent 1 → Output A
    ├── Runs Agent 2 → Output B
    ├── Runs Agent 3 → Output C
    ├── Runs Agent 4 → Output D
    ├── Cross-checks A ↔ B ↔ C ↔ D
    ├── Runs Agent 5 → Output E (compliance/config)
    ├── Stitches all outputs into final deliverable
    └── Delivers complete package to user
```

### Orchestrator Rules
1. **Define the step order explicitly** — numbered steps, no ambiguity
2. **Cross-check between steps** — after gathering all agent outputs, run consistency checks BEFORE stitching
3. **One delivery format** — the user gets ONE structured output, not scattered pieces
4. **Section labels with paste destinations** — tell the user exactly where each block goes (e.g. "→ PASTE INTO: ModelCreationNode — Description field")

---

## Intelligence Files (Reference Layer)

Intelligence files are the deep knowledge that agents load on demand. They contain:
- **Research-backed knowledge** — proven techniques, not guesses
- **Vocabulary libraries** — specific words/phrases the agent should use
- **Precision guides** — detailed descriptions for specific scenarios (beach sand types, lighting patterns, fabric names)
- **Failure modes + fixes** — what goes wrong and the exact fix
- **Borrowed patterns** — techniques borrowed from other skills, credited and adapted

### Intelligence File Structure

```markdown
# Agent Intelligence Library

## AGENT N — [Name]: Advanced Knowledge

### [Topic 1]
[Research finding or rule]
[Specific vocabulary/formulas to use]
[Examples]

### [Topic 2]
[Precision guide with specific options]
[Anti-patterns to avoid]

### Common Failure Modes
| Problem | Fix |
|---|---|
| [Issue] | [Exact language to add/change] |
```

### What Makes a Good Intelligence File
- **Specific, not general** — "use Fitzpatrick III: golden beige complexion with warm yellow undertone" not "describe skin color"
- **Actionable vocabulary** — copy-paste-ready phrases, not vague instructions
- **Anti-patterns with alternatives** — don't just say "don't do X", show what to do instead
- **Sourced where possible** — "Research from AI portrait studies shows 89.8% of images default to light skin" grounds the rule

---

## Skill Design Patterns from the Ecosystem

### Pattern 1: Context File (from Corey Haines' marketing skills)
Every skill reads a single context file FIRST so the AI already knows the product, brand, audience, and positioning before doing any task.

**Implementation:** `brand-context.md` template that the user fills once. All agents read it before running.

### Pattern 2: Anti-Generic Mandate (from Anthropic's frontend-design skill)
Explicitly ban generic/default outputs. Force the AI to commit to a specific direction BEFORE generating.

**Implementation:** Aesthetic Direction Menu — agent picks ONE direction and commits with justification. Anti-generic checklist runs before finalizing.

### Pattern 3: Grilling / Pre-Brief (from "Grill Me" community skill)
When user input is vague, don't guess — ask structured questions with recommended answers. ONE question at a time.

**Implementation:** Pre-Shoot Brief with 5 branches. If user provides <3 details → run the brief. If all details present → skip.

### Pattern 4: Humanizer Pass (from Content Humanizer skills)
Strip AI-sounding patterns from output. Banned vocabulary list. Check every adjective is specific and visual.

**Implementation:** Director runs humanizer pass before finalizing. Banned patterns checklist. "Write like a cinematographer, not an AI."

### Pattern 5: Sub-Skill Routing (from Sentry, WordPress, Expo)
Break large skills into focused sub-skills. A router skill detects what's needed and loads the right sub-skill.

**Implementation:** WordPress has `wordpress-router` → detects project type → routes to `wp-block-development`, `wp-plugin-development`, etc. Apply same pattern when skill grows beyond ~1000 lines.

### Pattern 6: Filter/Compliance Layer (from Trail of Bits security skills)
Dedicated agent that audits output against a compliance checklist before delivery.

**Implementation:** Agent 5 (Supervisor) checks API compliance, narrative structure, content filter safety. Runs AFTER all creative agents, BEFORE delivery.

---

## Quality Standards (from awesome-agent-skills)

A skill should meet these criteria:

1. **Real-world tested** — not theoretical. Must have been used in actual production.
2. **Specific trigger conditions** — description clearly states when to activate and when NOT to.
3. **Structured output** — every agent produces a named, formatted block. No free-form dumps.
4. **Cross-references** — agents reference specific files and sections, not vague "check the docs."
5. **Failure handling** — documents what goes wrong and how to fix it.
6. **Examples** — at least one complete input → output example showing the skill in action.
7. **No AI slop** — no generic, vague, or over-hedged language in the skill itself or its outputs.

---

## Skill vs Other Approaches — When to Use What

| Tool | Best For |
|------|----------|
| **Skill** | Reusable procedural knowledge across conversations — portable expertise |
| **Prompt** | One-time instructions and immediate context |
| **Project/CLAUDE.md** | Persistent background knowledge within a specific workspace |
| **MCP Server** | Connecting to external data sources and APIs |
| **Subagent** | Independent task execution with restricted tool access |

**Rule of thumb:** If you type the same prompt repeatedly across conversations → make it a skill.

---

## Key Repos for Reference

### awesome-agent-skills
- **Path:** `C:\Users\miuri\Documents\GitHub\awesome-agent-skills`
- **What:** 1100+ skills from official teams (Anthropic, Google, Vercel, Stripe, Cloudflare, Netlify, Trail of Bits, Sentry, Expo, Hugging Face, Figma, Microsoft, OpenAI, etc.)
- **Use for:** Structural patterns, progressive disclosure examples, sub-skill routing, quality standards

### awesome-claude-skills
- **Path:** `C:\Users\miuri\Documents\GitHub\awesome-claude-skills`
- **What:** Claude-specific skill ecosystem, official docs, community skills
- **Use for:** SKILL.md format, folder structure, frontmatter conventions, best practices, security guidelines

### Key official skills to study:
- **Anthropic `skill-creator`** — meta-skill that guides you through building new skills via Q&A
- **Anthropic `frontend-design`** — anti-generic mandate, bold design decisions
- **WordPress `wordpress-router`** — sub-skill routing pattern
- **Sentry skills** — 20+ sub-skills all following the same structure, great example of a large skill ecosystem
- **Expo skills** — 11 sub-skills for one platform, clean progressive disclosure
- **Trail of Bits** — security audit patterns, differential review, variant analysis
- **Corey Haines marketing** — 30 marketing sub-skills, `product-marketing-context` pattern
- **fal.ai** — 15 sub-skills for image/video/audio generation, closest to Nano Banana's domain
