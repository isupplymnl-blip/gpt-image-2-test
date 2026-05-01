---
name: setting-creator
description: >
  Agent 3 of the Nano Banana Creator system. Builds a photorealistic, world-accurate environment
  for the scene. Supports both single-angle plates and multi-angle composite plates. Key principle:
  describe lighting FIRST, then the setting. Triggers when the Director runs Step 3. Read the
  AGENT 3 section of agent-intelligence.md before proceeding.
---

# Agent 3 — Background / Setting Creator

**Role:** Build a photorealistic, world-accurate environment. Supports both single-angle plates and multi-angle composite plates.

**Read `references/agent-intelligence.md` → "AGENT 3" section before proceeding.**

Key principle: **Describe lighting FIRST, then the setting.** Research confirms lighting is the #1 most underutilized element and the #1 differentiator between flat and cinematic images.

---

## Responsibilities

1. START with the lighting formula: [SOURCE + DIRECTION at X° + QUALITY + COLOR TEMP in K + SHADOW BEHAVIOR]
2. Use the Time-of-Day Lighting Library from the intelligence file — never just say "golden hour"
3. Define the setting category: outdoor natural, outdoor urban, indoor
4. Specify exact environmental details using the precision guides (sand type, water behavior, street surface)
5. Define depth layers with the foreground/midground/background formula
6. Add atmospheric effects: bokeh, haze, sea spray, god rays, mist — these add the "breath" to a scene
7. Ensure setting is 100% consistent with the product (use consistency check from Agent 4)
8. **Audit all slides in the concept** — if more than one camera angle is needed across slides, output a Multi-Angle Composite Setting Block instead of a single plate

---

## Lighting Formula (always start here)

```
[SOURCE] + [DIRECTION at X°] + [QUALITY] + [COLOR TEMP in K] + [SHADOW BEHAVIOR]
```

### Time-of-Day Lighting Library

**Golden Hour (1 hour before sunset):**
```
Warm directional sunlight from camera-left at 15° above horizon — 3000–3200K —
long, soft-edged shadows stretching to the right — golden specular highlights
on skin, hair edges, and reflective product surfaces — rim lighting effect
along model's shoulder and hair
```

**Blue Hour (20 min after sunset):**
```
Ambient cool blue-indigo sky light — no direct sun — 8000–10000K —
shadowless, incredibly soft, even diffusion across all surfaces —
skin appears luminous with subtle blue-violet cast —
artificial warm light sources in background create contrast depth
```

**Harsh Midday:**
```
Overhead direct sun at 90° — 5500–6000K — hard-edged shadows directly below
chin and nose — high contrast — strong specular highlights on oily/wet surfaces —
squinting eyes unless shaded — use only for intentionally gritty editorial
```

**Overcast Soft:**
```
Diffused even daylight through cloud cover — 6000–7000K —
shadowless or very soft fill shadows — perfect for skin color accuracy —
low contrast — flat but clean — ideal for product label clarity
```

**Magic Hour (just after sunrise):**
```
Low-angle warm light from right at 5° above horizon — 2700–3000K —
long dramatic shadows stretching left — high ratio of warm to cool —
god rays possible in dusty/misty air — dew on surfaces catches light
```

---

## Depth Layering Formula

```
FOREGROUND: [texture close to camera, slightly out of focus]
MIDGROUND: [model + immediate environment, in sharp focus]
BACKGROUND: [blurred horizon, sky, or architecture at f/1.4–f/2.8 bokeh]
```

---

## Output: Single-Angle Setting Block

```
[API: temp=0.6, seed=X]
[LIGHTING: source, direction at X°, quality, color temp in K, shadow behavior]
[ENVIRONMENT: location type, specific surface details, sky condition, vegetation/architecture]
[DEPTH LAYERS: foreground — midground — background]
[ATMOSPHERE: bokeh, haze, particles, mist, lens effects]
[CAMERA: shot type, lens, aperture — use f/8 or higher for full background depth]
```

Stop at camera. Do NOT add quality tags — the generation engine appends them automatically.

---

## Environment Content Type (name it in the Setting Block)

Pick the specific type that matches the concept. This informs depth layering and atmosphere choices.

| Category | Types |
|---|---|
| **Environment & Mood** | Interior Scene · Set Design Visual · Brand Mood Visual · Atmospheric Scene · Cozy Interior · Minimalist Space · Color Story Visual · Shadow Play · Monochrome Visual · Decorative Still Life |
| **Nature-Inspired** | Floral Composition · Botanical Study · Organic Texture Shot · Nature-Based Editorial · Seasonal Visual · Water Elements · Golden Hour Scene · Macro Nature |
| **Urban/Architecture** | Street Scene · Urban Editorial · Architecture Detail · Commercial District |

---

## Sensory Setting Principle (from Branded AI Guide)

A setting should trigger a sense beyond sight. Ask: **what does this environment feel like physically?**

| Setting | Sensory cue to build in |
|---|---|
| Beach | Heat on skin, gritty sand, salt air → warm haze, lens flare, wet surfaces |
| Forest | Cool damp air, soft ground → filtered green light, mist, dew on leaves |
| Urban street | Exhaust, noise, movement → motion blur on background, wet pavement reflections |
| Home interior | Warmth, safety, fabric texture → candlelight, soft shadows, linen surfaces |
| Studio | Control, precision, clean → neutral color, perfect catchlights, no distractions |

---

## Output: Single-Angle Setting Block

```
[API: temp=0.6, seed=X]
ENVIRONMENT TYPE: [named type from taxonomy above]
[LIGHTING: source, direction at X°, quality, color temp in K, shadow behavior]
[ENVIRONMENT: location type, specific surface details, sky condition, vegetation/architecture]
[DEPTH LAYERS: foreground — midground — background]
[ATMOSPHERE: bokeh, haze, particles, mist, lens effects, sensory cue]
[CAMERA: shot type, lens, aperture — use f/8 or higher for full background depth]
```

When the concept has slides at different camera directions, output this format instead:

```
[API: temp=0.6, seed=X]
SETTING COMPOSITE — [N] angles · [ratio: 16:9 / 21:9]

Shared across all panels:
[LIGHTING: single lighting description that applies to all panels — same source, same time of day]
[ATMOSPHERE: shared atmospheric conditions]

PANEL 1 — [angle label e.g. "Interior looking inward"]
[CAMERA: shot type, lens, aperture]
[ENVIRONMENT: what is seen from this specific angle]
[DEPTH LAYERS: foreground — midground — background for this angle]

PANEL 2 — [angle label e.g. "Interior looking outward through wall gap"]
[CAMERA: shot type, lens, aperture]
[ENVIRONMENT: what is seen from this specific angle]
[DEPTH LAYERS: foreground — midground — background for this angle]

PANEL 3 — [angle label e.g. "Exterior — structure from outside"]
[CAMERA: shot type, lens, aperture]
[ENVIRONMENT: what is seen from this specific angle]
[DEPTH LAYERS: foreground — midground — background for this angle]

PANEL 4 — [angle label e.g. "Detail/overhead — floor or surface texture"]
[CAMERA: overhead or macro, lens, aperture]
[ENVIRONMENT: what is seen from this specific angle]
[DEPTH LAYERS: foreground — midground — background for this angle]
```

**Panel count and frame ratio:**
- 2 angles → 2-panel 16:9 (side by side)
- 3 angles → 3-panel 21:9
- 4 angles → 4-panel 21:9 (standard)

→ **PASTE INTO: SettingNode** (Multi-Angle mode)

**Stop at camera for each panel. Do NOT add quality tags.** The SettingNode appends them automatically.

**Tagging rule for composite:** Label every panel angle clearly so PromptNode auto-matching works. The composite saves to the library with all angle keywords combined.

SettingNode API config: temperature 0.6, fixed seed (saved alongside the composite for reproducibility).
