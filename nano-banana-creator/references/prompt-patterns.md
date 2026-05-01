# Nano Banana Prompt Patterns by Scene Type

## Pattern 1: Beach / Tropical Setting

```
[SHOT]: Editorial fashion photograph, medium shot with slight wide pull —
[SETTING]: [TIME OF DAY] beach, [LOCATION], [SAND TYPE] sand, [WATER COLOR] water, 
  [SKY CONDITION], [VEGETATION] in background —
[MODEL]: a [AGE]-year-old [ETHNICITY] woman/man, Fitzpatrick skin type [I–VI], 
  [SKIN QUALITY], [FACIAL FEATURES], [HAIR DESCRIPTION], 
  wearing [OUTFIT DESCRIPTION WITH FABRIC + COLOR] —
[INTERACTION]: [she/he] [holds/applies/wears] a [PRODUCT DESCRIPTION] in [hand position], 
  label facing camera, [LIGHT INTERACTION ON PRODUCT] —
[LIGHT]: [DIRECTION] sunlight at [ANGLE]° above horizon, [COLOR TEMP]K, [SHADOW DESCRIPTION] —
[ATMOSPHERE]: [BOKEH/HAZE/FLARE DESCRIPTION] —
[QUALITY]: Shot on Hasselblad X2D 100C, 85mm f/1.4, ISO 100 — hyperrealistic editorial photography — 
  8K resolution — cinematic depth of field — no distortion — anatomically correct
```

**Beach Parameter Settings:**
- temperature: 1.0–1.1 (warm, natural)
- top_p: 0.97
- seed: 42 (anchor), then try 43, 44 for wind/wave variations

---

## Pattern 2: Studio / White Background

```
[SHOT]: Clean editorial portrait, [SHOT TYPE] —
[SETTING]: Seamless white studio backdrop, soft box lighting from [LEFT/RIGHT], 
  fill light on opposite side, no harsh shadows —
[MODEL]: [FULL MODEL DESCRIPTION] —
[INTERACTION]: [PRODUCT INTERACTION DESCRIPTION] —
[LIGHT]: Professional studio strobe, 5600K daylight balanced, 
  [SOFTBOX SIZE] softbox, [RATIO] lighting ratio —
[ATMOSPHERE]: Shallow depth of field, background perfectly white/gray gradient —
[QUALITY]: Shot on Phase One IQ4, 80mm, f/8, ISO 50 — commercial product photography — 
  8K — flawless skin retouching level detail — studio-perfect
```

**Studio Parameter Settings:**
- temperature: 0.6–0.8 (controlled, precise)
- top_p: 0.93
- top_k: 30
- seed: fixed (consistency matters most in studio shots)

---

## Pattern 3: Urban / Street Setting

```
[SHOT]: Street fashion editorial, [SHOT TYPE] —
[SETTING]: [CITY NAME] street, [NEIGHBORHOOD FEEL], [TIME OF DAY], 
  [WEATHER CONDITION], [ARCHITECTURAL DETAIL], [STREET TEXTURE] ground —
[MODEL]: [FULL MODEL DESCRIPTION] —
[INTERACTION]: [PRODUCT INTERACTION DESCRIPTION] —
[LIGHT]: [NATURAL/ARTIFICIAL LIGHT SOURCE], [COLOR TEMP]K, 
  [QUALITY: neon reflections / street lamp warmth / overcast soft] —
[ATMOSPHERE]: Motion blur on background pedestrians, urban bokeh, 
  [SPECIFIC ATMOSPHERIC DETAIL] —
[QUALITY]: Shot on Sony A7R V, 50mm f/1.2 — hyperrealistic street photography — 
  8K — film grain texture — cinematic
```

**Urban Parameter Settings:**
- temperature: 1.1–1.3 (gritty, varied)
- top_p: 0.98
- top_k: 50
- Enable Google Search grounding for real city details

---

## Pattern 4: Nature / Forest / Garden

```
[SHOT]: Lifestyle nature editorial, [SHOT TYPE] —
[SETTING]: [FOREST TYPE / GARDEN TYPE], [TIME OF DAY], 
  [LIGHT CONDITION: dappled, golden shafts, overcast], 
  [GROUND DETAIL: mossy rocks, fallen leaves, wildflowers], 
  [BACKGROUND DEPTH: dense canopy / open sky] —
[MODEL]: [FULL MODEL DESCRIPTION with natural, earth-tone outfit] —
[INTERACTION]: [PRODUCT INTERACTION DESCRIPTION] —
[LIGHT]: Natural [DIRECTION] light, [COLOR TEMP]K, 
  [QUALITY: god rays / soft diffused / blue hour] —
[ATMOSPHERE]: [MIST / BOKEH LEAVES / POLLEN PARTICLES / FIREFLIES] —
[QUALITY]: Shot on Leica SL3, 90mm Summicron, f/2 — 
  fine art nature photography — 8K — organic textures — atmospheric
```

---

## Pattern 5: Luxury Interior

```
[SHOT]: Architectural fashion editorial, [SHOT TYPE] —
[SETTING]: [INTERIOR TYPE: penthouse / boutique hotel / minimal villa], 
  [INTERIOR DETAILS: marble floor, floor-to-ceiling windows, art piece], 
  [VIEW: city skyline / garden / ocean], [LIGHT CONDITION] —
[MODEL]: [FULL MODEL DESCRIPTION with luxury outfit] —
[INTERACTION]: [PRODUCT INTERACTION DESCRIPTION] —
[LIGHT]: Soft [WINDOW/LAMP] light, [COLOR TEMP]K, 
  [QUALITY: warm candlelit / cool gallery white / dramatic contrast] —
[ATMOSPHERE]: [REFLECTIONS / SHADOWS / MATERIAL TEXTURES] —
[QUALITY]: Shot on Hasselblad H6D-400c MS, 100mm, f/5.6 — 
  luxury lifestyle photography — 8K — impeccable detail — aspirational
```

---

## Product Description Templates

### Skincare Serum/Oil
```
a [SIZE]ml [SHAPE: cylindrical/square/dropper] bottle, [MATERIAL: frosted glass/clear glass/matte black], 
[LABEL: minimal white/gold embossed/printed], [CAP TYPE: metallic dropper/twist cap/pump], 
[PRODUCT COLOR INSIDE: golden amber/clear/milky white], 
catching [SPECULAR HIGHLIGHTS: warm gold glint / cool silver reflection]
```

### Supplement/Wellness
```
a [SIZE] [FORMAT: bottle/pouch/tin], [MATERIAL], [COLOR SCHEME], 
[LABEL STYLE: clean sans-serif/bold type/handwritten], 
[OPENING STATE: sealed/cap removed], [CONTENTS VISIBLE: powder/capsules/tablets]
```

### Beverage
```
a [SIZE]ml [SHAPE] [MATERIAL: glass bottle/aluminum can/tetra pak], 
[LABEL DESIGN: colorful/minimal/illustrated], [CONDENSATION: yes/no — if yes: fine water droplets on surface], 
[TEMPERATURE SUGGESTION: ice cold/room temp], [CONTENTS COLOR IF VISIBLE]
```

### Fashion/Accessory
```
a [ITEM: tote bag/watch/sunglasses/bracelet], [MATERIAL: [SPECIFIC MATERIAL]], 
[COLOR: [SPECIFIC COLOR]], [SIZE RELATIVE TO MODEL], 
[DETAIL: hardware finish/stitching/logo placement], 
[HOW WORN/HELD: on wrist/draped over shoulder/held loosely in left hand]
```

---

## Model Ethnicity + Fitzpatrick Scale Reference

| Fitzpatrick Type | Description | Tone |
|---|---|---|
| I | Very fair, always burns | Porcelain, ivory |
| II | Fair, usually burns | Light beige, peachy |
| III | Medium, sometimes burns | Light brown, golden beige |
| IV | Olive/medium brown, rarely burns | Caramel, warm tan |
| V | Brown, very rarely burns | Deep brown, mahogany |
| VI | Deeply pigmented, never burns | Ebony, deep espresso |

---

## Lighting Color Temperature Guide

| Temp (K) | Quality | Best for |
|---|---|---|
| 2700–3200K | Warm golden/amber | Sunset, candlelit, golden hour |
| 3500–4000K | Warm white | Lifestyle interior, cozy |
| 5000–5600K | Daylight neutral | Studio, overcast day |
| 6000–7000K | Cool blue-white | Morning light, blue hour, tech |
| 8000K+ | Deep blue/cyan | Dawn, twilight, underwater |

---

## Shot Type Vocabulary

| Shot Type | Description | When to Use |
|---|---|---|
| ECU (Extreme Close-Up) | Face only / product only | Product detail, beauty |
| CU (Close-Up) | Head to collarbone | Expression, face-product |
| MCU (Medium Close-Up) | Head to chest | Beauty campaigns |
| MS (Medium Shot) | Head to waist | Lifestyle, engagement |
| MLS (Medium Long Shot) | Head to knees | Fashion, setting context |
| LS (Long Shot) | Full body visible | Fashion, location emphasis |
| WS (Wide Shot) | Small figure in big setting | Landscape, scale, mood |

---

## Proven Seed Combinations

### For Beach Scenes
- Seed 42: Standard golden hour
- Seed 43: Slight wave movement in background
- Seed 44: Hair tousled more by wind
- Seed 55: More dramatic sky/clouds
- Seed 77: Different camera angle feel

### For Studio Scenes
- Seed 42: Neutral anchor
- Seed 100: Slight shadow variation
- Seed 200: Expression change
- Same seed + temperature ±0.1: Subtle rendering difference

### For Urban Scenes
- Seed 42: Daytime clarity
- Seed 13: Moody, contrasty
- Seed 88: Rainy/wet pavement reflections tendency
- Seed 99: Nighttime neon feel
