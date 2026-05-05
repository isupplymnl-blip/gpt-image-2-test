# Generic Mode Formatting

**Workflow mode:** `generic`

**Target users:** Tool-agnostic output. User/host-app knows how to route the blocks.

---

## Output Format

### 1. Creative Brief Summary
Standard format.

### 2. Model Block
Standard format.

### 3. Setting Block
Standard format.

### 4. Product Block
Standard format.

### 5. Master Prompt
**Includes optional `[API:]` tag on line 1.**

The tag documents the intended parameters. User decides whether to use it or strip it.

**Format:**
```
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42]

[MASTER PROMPT TEXT]
```

### 6. API Configuration
Standard parameter block listing all generation config values.

### 7. Ready-to-Run Code
**Optional.** Include basic JS + Python snippets for reference, but don't emphasize like api-direct mode.

### 8. Seed Exploration Guide
Standard format.

---

## What's Different in Generic Mode

| Element | Generic Mode | Other Modes |
|---|---|---|
| **Master Prompt** | Optional `[API:]` tag | iSupply: required; api-direct/ai-studio: omitted |
| **Paste Targets** | None | iSupply: explicit node targets |
| **Ready-to-Run Code** | Optional, basic | api-direct: emphasized; iSupply/ai-studio: omitted |
| **Formatting** | Minimal, tool-agnostic | Other modes: workflow-specific |

---

## Example Output

```
### 📋 Creative Brief Summary
[standard format]

### 🧍 Model Block
[standard format]

### 🏖️ Setting Block
[standard format]

### 📦 Product Block
[standard format]

### 🎬 Master Prompt

[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42]

Photograph an outdoor elevated platform campaign visual with powder blue sky background. 
A 20-year-old Chinese-Filipina woman positioned in the left 35% of frame, holding iSupply 
Pro 2 wireless earbuds in her extended left hand occupying 15% of frame.

[... rest of prompt ...]

### ⚙️ API Configuration

model: gemini-3.1-flash-image-preview
temperature: 1.0
topP: 0.97
topK: 40
seed: 42
candidateCount: 1
responseModalities: ["IMAGE"]

### 🌱 Seed Exploration Guide
[standard format]
```

---

**Last Updated:** 2026-05-05
**Version:** 1.0
