# iSupply Mode — Node Canvas Workflow Reference

Load this file ONLY when workflow mode is set to `isupply`. The Director reads it after the intake handshake confirms the user is working inside iSupply AI Studio.

When iSupply Mode is ON, all agent outputs are re-formatted with node-specific paste targets, canvas connection rules, and the `[API: ...]` auto-fill tag format.

---

## Canvas Nodes — What Each One Does

| Node | Purpose | Input | Output |
|---|---|---|---|
| **UploadNode** | Store reference images with tags | Image file + tag keywords | Tagged asset in library, auto-matches to prompt text |
| **ModelCreationNode** | Build multi-panel model reference sheet | Model Block text | 4/6-panel composite (Front · 3/4 · Side · Back) |
| **SettingNode** | Generate background plate (single or multi-angle) | Setting Block text | Plate image(s), connects to PromptNode via canvas edge |
| **PromptNode** | Final scene generation | Master Prompt + connected plates + tagged uploads | Generated image |
| **CarouselPromptNode** | Per-slide carousel generation | Master Prompt per slide + connected plates | Multi-slide output, seed-locked for consistency |
| **OutputNode** | Display + Seed Explorer | Generated image from PromptNode | Seed-variant grid (+1, +7, +13, +35, +58) |

---

## The `[API: ...]` Auto-Fill Tag

iSupply AI Studio reads the `[API: ...]` tag on line 1 of any pasted prompt and auto-fills the node's settings panel (model, temperature, topP, topK, seed, etc.). The app strips the tag before sending the prompt to Gemini.

**For PromptNode / CarouselPromptNode:**
```
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=42]
```

**For SettingNode (different format — plate generation uses lower temp):**
```
[API: temp=0.6, seed=42]
```

**For ModelCreationNode (same format as PromptNode):**
```
[API: model=gemini-3.1-flash-image-preview, temp=0.9, topP=0.95, topK=40, seed=42]
```

**Carousel rule:** every slide gets the same `[API:]` tag with the same seed — seed consistency across slides is how thoughtSignature threading keeps characters/product visually locked.

---

## Tag Auto-Matching (UploadNode ↔ PromptNode)

For reference images stored in UploadNode to auto-match into a PromptNode generation, the tags on the UploadNode asset must match words that appear verbatim in the Master Prompt.

**Tagging strategy per reference type:**

### Product upload
```
Tags: [product name], [product type], [key material], [key color], [brand]
Example: isupply-pro-2, earbuds, glossy white, stem-style, wireless, iSupply
```
Then in the Master Prompt include: `the iSupply Pro 2 earbuds — glossy white stem-style wireless earbuds…` — all tag keywords must appear.

### Model upload (face reference)
```
Tags: [identity name], [ethnicity], [age range], [distinctive feature], [gender]
Example: maya-v1, filipina, mid-twenties, freckles, female
```

### Setting plate (saved from SettingNode to library)
```
Tags: [location type], [time of day], [mood], [angle label if multi-angle]
Example: coastal-beach, golden-hour, warm-editorial, interior-looking-outward
```

**Critical rule:** Gemini Reference Image Limits apply — max 14 images per generation, each ≤1024px JPEG q85. Order matters: most important image first (product → model → setting).

---

## Canvas Edge Connections

iSupply AI Studio uses directed edges on the canvas to pass generated assets between nodes. The Director must instruct the user which edges to draw.

**Standard 5-step workflow:**

```
STEP 1 — Upload product reference photo → UploadNode → set tags from Product Block
STEP 2 — Generate model reference sheet → ModelCreationNode → paste Model Block
STEP 3 — Generate background plate → SettingNode → paste Setting Block
STEP 4 — Connect canvas edges:
         UploadNode(product) ──▶ PromptNode
         ModelCreationNode ─────▶ PromptNode
         SettingNode ──────────▶ PromptNode
STEP 5 — Generate the scene → PromptNode → paste Master Prompt
STEP 6 — Explore variants → OutputNode Seed Explorer (+1, +7, +13, +35)
```

**Carousel workflow (multi-slide):**

```
STEP 1 — Upload product photo → UploadNode → tag it
STEP 2 — Generate model composite → ModelCreationNode → paste Model Block
STEP 3 — Generate primary plate → SettingNode → paste Setting Block (tagged with primary angle)
STEP 3b — IF any slide has [PLATE: NEW] flag:
         Generate second plate → second SettingNode → paste second Setting Block
STEP 4 — Draw edges:
         UploadNode → all CarouselPromptNodes
         ModelCreationNode → all CarouselPromptNodes
         SettingNode(primary) → slides flagged [PLATE: PRIMARY] and [PLATE: OVERRIDE]
         SettingNode(new) → slides flagged [PLATE: NEW]
STEP 5 — Create one CarouselPromptNode per slide → paste each slide's Master Prompt
STEP 6 — Output carousel → OutputNode
```

---

## Output Formatting for iSupply Mode

When iSupply mode is ON, the Director re-formats the Final Delivery Package headers with explicit paste targets:

```
### 📋 Creative Brief Summary
→ REFERENCE ONLY, no paste required

### 🧍 Model Block
→ PASTE INTO: ModelCreationNode — Description field
→ Click Create. Node builds multi-panel composite. Save to library.

### 🏖️ Setting Block
→ PASTE INTO: SettingNode
→ Standard mode for single-angle, Multi-Angle mode for composite plate

### 📦 Product Block
→ TAGS: [keyword list] → paste into UploadNode tag field
→ IMAGE: upload your actual product reference photo to UploadNode
→ TEXT: already embedded in Master Prompt (no separate paste needed)

### 🎬 Master Prompt
→ PASTE INTO: PromptNode (or CarouselPromptNode per slide)
→ Line 1 [API:] tag auto-fills node settings

### ⚙️ API Configuration
→ AUTO-FILLED by [API: ...] tag on line 1 of Master Prompt
→ Verify in node sidebar after pasting

### 🌱 Seed Exploration Guide
→ Use in OutputNode Seed Explorer
→ Enter base seed, app generates +1, +7, +13, +35 automatically
```

---

## Multi-Angle Composite Setting Block — iSupply Format

For carousel shoots where slides need different camera angles, SettingNode supports Multi-Angle mode. Format the Setting Block as:

```
[API: temp=0.6, seed=X]
SETTING COMPOSITE — [N] angles · [ratio: 16:9 / 21:9]

Shared across all panels:
[LIGHTING: single lighting description for all panels]
[ATMOSPHERE: shared atmospheric conditions]

PANEL 1 — [angle label, e.g., "Interior looking inward"]
[CAMERA: shot type, lens, aperture]
[ENVIRONMENT: what's seen from this angle]
[DEPTH LAYERS: FG — MG — BG for this angle]

PANEL 2 — [angle label, e.g., "Interior looking outward through doorway"]
[...]

PANEL 3 — [angle label, e.g., "Exterior — structure from outside"]
[...]

PANEL 4 — [angle label, e.g., "Detail/overhead"]
[...]
```

**Panel count and ratio:**
- 2 angles → 2-panel 16:9 (side by side)
- 3 angles → 3-panel 21:9
- 4 angles → 4-panel 21:9 (standard)

**Tagging rule:** label each panel's angle clearly so PromptNode auto-matching selects the right panel for each carousel slide.

---

## Plate Flag Rules (Carousel Camera Angle Audit)

Every carousel slide receives one of three plate flags from the Director:

**`[PLATE: PRIMARY]`**
Camera angle matches the primary SettingNode plate. No action needed — PromptNode uses the connected plate as-is.

**`[PLATE: OVERRIDE — inline setting included]`**
Camera angle differs from primary plate. Director embeds a brief setting description directly inside this slide's Master Prompt. The primary plate still provides lighting/color continuity:
```
SETTING (angle differs from primary plate — description included):
[brief inline setting: background from this angle, light direction, surfaces, depth layers]
```

**`[PLATE: NEW — second SettingNode required]`**
Completely different environment or ≥90° lighting flip. Director outputs a second Setting Block. User creates a second SettingNode and connects it to the flagged slides only.

---

## When iSupply Mode ≠ General Mode

| Aspect | General Mode | iSupply Mode |
|---|---|---|
| Model Block paste target | "Use directly in model reference input" | "PASTE INTO: ModelCreationNode — Description field" |
| Setting Block paste target | "Inline in prompt or as separate background generation input" | "PASTE INTO: SettingNode (Standard or Multi-Angle mode)" |
| Product reference | "Attach as inlineData to API call" | "Upload to UploadNode with these tags → auto-matches via tag keywords in Master Prompt" |
| API parameters | "Apply in API Config or AI Studio sidebar" | "AUTO-FILLED by [API:] tag on line 1 of Master Prompt" |
| Carousel workflow | "Generate N times with seed-locked calls" | "Use CarouselPromptNode with seed consistency, plate flags per slide" |
| Seed exploration | "Loop through seed+1/+7/+13 manually" | "Enter base seed in OutputNode → Seed Explorer auto-generates grid" |
| Reference image limit | "14 images / call, text-first part ordering" | "UploadNode tag auto-matching handles this — tag correctly and the app manages ordering" |

---

## Quick Start Checklist (iSupply Mode)

Before generating, confirm:
- [ ] Product reference photo uploaded to UploadNode with correct tags
- [ ] If model consistency is needed across shoots: model face reference uploaded to UploadNode
- [ ] ModelCreationNode created and connected to PromptNode
- [ ] SettingNode created and connected to PromptNode (skip if PromptNode is self-contained)
- [ ] All Master Prompt tag keywords match UploadNode asset tags
- [ ] Seed locked (use same seed for carousel slides, vary for single-image exploration)
