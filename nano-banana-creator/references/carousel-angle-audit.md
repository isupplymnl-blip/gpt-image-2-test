# Carousel Camera Angle Audit

**Purpose:** Detect when carousel slides use different camera angles than the primary Setting Block, preventing visual mismatches.

**When to use:** Director Step 7 — before writing Master Prompts for carousel generation.

---

## The Core Question

Before writing any Master Prompt, read every slide description and ask:

> **"Does this slide's camera face the same direction as the primary Setting Block?"**

---

## Common Angle Conflicts

Check for:

| Conflict Type | Description | Impact |
|---|---|---|
| **Interior → Doorway/Opening** | Camera now faces outward | Primary interior plate won't match |
| **Interior → Exterior** | Camera shifts from inside the structure to outside entirely | Plate is irrelevant |
| **Horizontal → Overhead** | Flat-lay or top-down shot | Plate is irrelevant |
| **Wide → Macro/Close-up** | Background fully blurred | Plate still useful for light direction |

---

## The Three Plate Flags

Tag every slide with one of these flags:

### `[PLATE: PRIMARY]`

**When:** Camera angle matches the primary setting plate.

**Action:** No action needed. Slide uses the primary Setting Block as-is.

**Example:**
```
CAROUSEL SLIDE 1 — Hero shot [PLATE: PRIMARY]
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=67]
[Master Prompt for slide 1]
```

---

### `[PLATE: OVERRIDE — inline setting included]`

**When:** Camera angle is different but not completely incompatible.

**Action:** Director embeds a brief setting description directly inside this slide's Master Prompt.

**Format:**
```
SETTING (angle differs from primary plate — description included):
[brief inline setting: background from this angle, light direction, surfaces, depth layers]
```

**Example:**
```
CAROUSEL SLIDE 3 — Close-up detail [PLATE: OVERRIDE — inline setting included]
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=67]

Macro shot, 100mm lens, f/2.8 shallow depth of field.

SETTING (angle differs from primary plate — description included):
Blurred warm bokeh background, soft diffused natural light from camera-left, warm cream tones, out-of-focus texture suggesting fabric or natural material.

[rest of Master Prompt...]
```

---

### `[PLATE: NEW — second setting plate required]`

**When:** Completely different environment OR 180° lighting flip.

**Action:** Director outputs a second Agent 3 Setting Block for this slide.

**Example:**
```
CAROUSEL SLIDE 4 — Outdoor lifestyle [PLATE: NEW — second setting plate required]
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=67]

[Master Prompt references Setting Block 2]

---

SETTING BLOCK 2 (for Slide 4):
[Full Agent 3 output for outdoor environment]
```

---

## Carousel Output Format

```
CAROUSEL SLIDE 1 — [scene label] [PLATE: PRIMARY]
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=67]
[Master Prompt for slide 1]

CAROUSEL SLIDE 2 — [scene label] [PLATE: PRIMARY]
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=67]
[Master Prompt for slide 2]

CAROUSEL SLIDE 3 — [scene label] [PLATE: OVERRIDE — inline setting included]
[API: model=gemini-3.1-flash-image-preview, temp=1.0, topP=0.97, topK=40, seed=67]
[Master Prompt for slide 3 — contains embedded SETTING block]
```

---

## Carousel Rules

- **Every slide gets its own `[API: ...]` tag on line 1** — same values, same seed across all slides
- **Plate flags appear on every slide header** — never omit them
- **OVERRIDE slides still receive the primary plate connection** — the inline setting supplements, doesn't replace
- **thoughtSignature threading handles consistency between slides automatically** (Gemini 3 only)

---

## Decision Tree

```
For each carousel slide:
  ├─ Camera angle matches primary Setting Block?
  │  ├─ YES → [PLATE: PRIMARY]
  │  └─ NO → Continue
  │
  ├─ Completely different environment OR 180° lighting flip?
  │  ├─ YES → [PLATE: NEW — second setting plate required]
  │  └─ NO → Continue
  │
  └─ Different angle but compatible lighting/mood?
     └─ YES → [PLATE: OVERRIDE — inline setting included]
```

---

**Last Updated:** 2026-05-05
**Version:** 1.0
