# Sidebar Settings Comparison: OpenAI vs Pudding OpenAI

## Current State (What's Implemented)

### 1. ModelCreationNode
**OpenAI:**
- Image Size: 1K / 2K / 4K

**Pudding OpenAI:**
- Image Size: 1K / 2K / 4K

**Status:** ✅ IDENTICAL (both show same 1 row)

---

### 2. SettingNode
**OpenAI:**
- Image Size: 1K / 2K / 4K

**Pudding OpenAI:**
- Image Size: 1K / 2K / 4K

**Status:** ✅ IDENTICAL (both show same 1 row)

---

### 3. PromptNode
**OpenAI:**
- Image Size: 1K / 2K / 4K

**Pudding OpenAI:**
- Image Size: 1K / 2K / 4K

**Status:** ✅ IDENTICAL (both show same 1 row)

---

### 4. CarouselPromptNode
**OpenAI:**
- Image Size: 1K / 2K / 4K

**Pudding OpenAI:**
- Image Size: 1K / 2K / 4K

**Status:** ✅ IDENTICAL (both show same 1 row)

---

### 5. OutputNode
**OpenAI:**
- No sidebar controls
- Only shows provider label: "OpenAI Image"

**Pudding OpenAI:**
- No sidebar controls
- Only shows provider label: "Pudding OpenAI"

**Status:** ✅ IDENTICAL (no sidebars, just label difference)

---

### 6. UploadNode
**OpenAI:**
- No provider-specific controls

**Pudding OpenAI:**
- No provider-specific controls

**Status:** ✅ IDENTICAL (no provider checks at all)

---

## What API Actually Supports (From route.ts files)

### OpenAI API (`/api/generate-openai/route.ts` line 115-129)
```typescript
{
  model: 'gpt-image-2',                    // NOT IN SIDEBAR
  quality: settings?.quality ?? 'medium',  // NOT IN SIDEBAR
  size: settings?.size ?? 'auto',          // NOT IN SIDEBAR
  output_format: settings?.output_format ?? 'png',  // NOT IN SIDEBAR
  background: settings?.background ?? 'auto',       // NOT IN SIDEBAR
  moderation: settings?.moderation ?? 'auto',       // NOT IN SIDEBAR
  n: settings?.n ?? 1,
}
```

### Pudding OpenAI API (`/api/pudding-openai/route.ts` line 126-132)
```typescript
{
  model: 'gpt-image-2',           // NOT IN SIDEBAR
  prompt,
  size: settings?.size ?? 'auto', // NOT IN SIDEBAR
  quality: settings?.quality ?? 'medium',  // NOT IN SIDEBAR
  n: settings?.n ?? 1,
  response_format: 'b64_json',
}
```

---

## Missing Sidebar Controls (For All 4 Nodes with Sidebars)

**Applies to:** ModelCreationNode, SettingNode, PromptNode, CarouselPromptNode

### 1. Model Selector
- **Options:** `gpt-image-1` | `gpt-image-2`
- **Default:** `gpt-image-2`
- **Note:** gpt-image-2 = latest · flexible sizes up to 4K · no transparent bg
- **Both providers:** ✅ Same

### 2. Quality
- **Options:** `low` | `medium` | `high`
- **Default:** `medium`
- **Pricing:** Low = $0.006 · Medium = $0.053 · High = $0.211 per image
- **Both providers:** ✅ Same

### 3. Size (Detailed)
- **Options:** 
  - `auto` (model decides)
  - `1024×1024`
  - `1536×1024`
  - `1024×1536`
  - `2048×1152`
  - `3840×2160` (4K)
- **Default:** `auto`
- **Note:** gpt-image-2 supports up to 4K flexible sizes
- **Both providers:** ✅ Same

### 4. Output Format
- **Options:** `png` | `jpeg` | `webp`
- **Default:** `png`
- **Both providers:** ✅ Same

### 5. Background
- **Options:** `auto` | `opaque`
- **Default:** `auto`
- **Note:** gpt-image-2 doesn't support transparent — Auto or Opaque only
- **OpenAI only:** ✅ Has this
- **Pudding OpenAI:** ❌ Doesn't support

### 6. Moderation
- **Options:** `auto` | `low`
- **Default:** `auto`
- **Note:** Auto = standard safety · Low = fewer false-positive refusals
- **OpenAI only:** ✅ Has this
- **Pudding OpenAI:** ❌ Doesn't support

---

## What Needs to Be Added

### For ModelCreationNode, SettingNode, PromptNode, CarouselPromptNode:

**BOTH OpenAI and Pudding OpenAI need:**

**Row 1: Model Selector**
```
[gpt-image-1] [gpt-image-2]
```

**Row 2: Quality**
```
[Low] [Medium] [High]
```

**Row 3: Size**
```
[auto] [1024×1024] [1536×1024] [1024×1536] [2048×1152] [3840×2160]
```

**Row 4: Output Format**
```
[PNG] [JPEG] [WebP]
```

**ONLY OpenAI needs (not Pudding OpenAI):**

**Row 5: Background**
```
[Auto] [Opaque]
```

**Row 6: Moderation**
```
[Auto] [Low]
```

---

### For OutputNode:
- No sidebar controls needed (just displays output)
- Already shows correct provider label

### For UploadNode:
- No provider-specific controls needed

---

## Summary

**Current:** 
- 4 nodes (ModelCreation, Setting, Prompt, Carousel) show only 1 row (Image Size: 1K/2K/4K)
- OutputNode has no sidebar
- UploadNode has no provider checks

**Should have:** 
- **OpenAI:** 6 rows (Model, Quality, Size, Format, Background, Moderation)
- **Pudding OpenAI:** 4 rows (Model, Quality, Size, Format)

**Key Difference:** OpenAI has 2 extra settings (Background, Moderation) that Pudding OpenAI doesn't support in its API
