# OpenAI Generation Fixes

## Issues Found

### 1. Model 'Flash' passed to OpenAI
**Error:** `400 The model 'Flash' does not exist`

**Root cause:** 
- `page.tsx:901` reads `settings?.providerOverride ?? activeProviderRef.current`
- But `settings` object contains Gemini params like `model: 'Flash'`
- These get passed through to OpenAI provider unchanged

**Fix:** Filter/map settings based on provider before passing to generation

### 2. No routing to `/api/generate-openai`
**Error:** Generation always hits `/api/generate` (Gemini route)

**Root cause:**
- `page.tsx:926-929` always calls `callGenerate` or `callGeminiGenerateStream`
- No conditional routing based on `effectiveProvider`
- `/api/generate` route doesn't exist (empty directory)

**Fix:** Add provider-based routing:
```typescript
if (effectiveProvider === 'openai') {
  await callOpenAIGenerate([outId], {...});
} else {
  await callGeminiGenerate([outId], {...});
}
```

### 3. "Generating with Gemini" hardcoded
**Location:** `OutputNode.tsx:131`

**Fix:** Make dynamic based on provider:
```typescript
<p>Generating with {providerLabel}…</p>
```

### 4. Auth errors
**Error:** `401 Authentication failed for openai`

**Cause:** `OPENAI_API_KEY` not set or invalid in `.env.local`

**Fix:** User must add valid key to `.env.local`

## Implementation Plan

1. ✅ Add structured question protocol to director prompts
2. ⏳ Create `callOpenAIGenerate` function in `page.tsx`
3. ⏳ Add provider routing in `onGenerateSlide`, `onRegenerate`, `onGenerateCarousel`
4. ⏳ Pass provider to OutputNode and make label dynamic
5. ⏳ Add settings mapper to filter provider-specific params
6. ⏳ User: verify `OPENAI_API_KEY` in `.env.local`
