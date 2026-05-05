# AI Studio Mode Formatting

**Workflow mode:** `ai-studio`

**Target users:** Users working in Google AI Studio web interface (aistudio.google.com).

---

## Output Format

### 1. Creative Brief Summary
Standard format (same across all modes).

### 2. Model Block
Standard format (same across all modes).

### 3. Setting Block
Standard format (same across all modes).

### 4. Product Block
Standard format (same across all modes).

### 5. Master Prompt
**Clean prompt text with NO `[API:]` tag.**

AI Studio users enter parameters in the sidebar manually. The `[API:]` tag would break the prompt if pasted into the prompt field.

**Format:**
```
[MASTER PROMPT TEXT — clean, no API tag, ready to paste into AI Studio prompt field]
```

### 6. AI Studio Sidebar Settings

**Provide a separate block listing every parameter to type into the sidebar:**

```
AI Studio Sidebar Settings:
  Model: gemini-3.1-flash-image-preview
  Temperature: 1.0
  Top P: 0.97
  Top K: 40
  Seed: 42
  Response Modalities: ✅ IMAGE (check the box)
  Safety Settings: [defaults]
  
  Optional (Gemini 3 only):
  Thinking Level: High
  Include Thoughts: ✅ (check the box)
  
  Optional Tools:
  Google Search: [enable if needed]
  Image Search: [enable if needed — 3.1 Flash only]
```

### 7. Reference Image Upload Instructions

**When reference images are needed:**

```
Reference Images:
1. Click "Add image" in AI Studio
2. Upload: [filename.jpg]
3. Add label in prompt: "Image 1: reference style — typography hierarchy, layout grid, color palette to match."
4. Paste Master Prompt below the image label
```

### 8. Seed Exploration Guide
Standard format (same across all modes).

### 9. Ready-to-Run Code
**Omit this section.** AI Studio users work in the web interface, not code.

---

## What's Different in AI Studio Mode

| Element | AI Studio Mode | Other Modes |
|---|---|---|
| **Master Prompt** | No `[API:]` tag | iSupply/generic: includes `[API:]` tag |
| **Parameter Format** | Sidebar settings block | iSupply: auto-filled from tag; api-direct: in code |
| **Reference Images** | Upload instructions | iSupply: UploadNode; api-direct: `inlineData` code |
| **Ready-to-Run Code** | Omitted | api-direct: emphasized; iSupply: omitted |
| **Paste Targets** | None (web UI workflow) | iSupply: explicit node targets |

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

Photograph an outdoor elevated platform campaign visual with powder blue sky background. 
A 20-year-old Chinese-Filipina woman positioned in the left 35% of frame, holding iSupply 
Pro 2 wireless earbuds in her extended left hand occupying 15% of frame.

[... rest of prompt ...]

### ⚙️ AI Studio Sidebar Settings

Model: gemini-3.1-flash-image-preview
Temperature: 1.0
Top P: 0.97
Top K: 40
Seed: 42
Response Modalities: ✅ IMAGE
Safety Settings: [defaults]

### 🌱 Seed Exploration Guide
[standard format]
```

---

**Last Updated:** 2026-05-05
**Version:** 1.0
