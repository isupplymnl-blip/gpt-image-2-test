# OpenAI Generation - All Fixes Applied

## ✅ Fixed Issues

### 1. Structured Question Protocol (ask_user_question error)
**Fixed:** Added inline JSON schema to both director prompts
- `app/lib/prompts/gemini-director.ts` - Added structured question protocol
- `app/lib/prompts/openai-director.ts` - Added structured question protocol

AI now emits:
```json
{
  "question": "What vibe are you going for?",
  "follow_up": [
    {"label": "Editorial", "description": "Bold, dramatic..."},
    ...
  ]
}
```

Frontend parses and renders as clickable chips (already implemented).

### 2. Model 'Flash' Sent to OpenAI
**Fixed:** Hardcoded OpenAI model to `'gpt-image-2'` in API route
- `app/api/generate-openai/route.ts:36` - Changed from `settings?.model` to hardcoded `'gpt-image-2'`
- Removed spread operator that was leaking Gemini params

### 3. No Routing to OpenAI Endpoint
**Fixed:** Added `effectiveProvider === 'openai'` checks in generation functions
- `app/page.tsx:925-928` - Added OpenAI branch in `onGenerateSlide`
- `app/page.tsx:959-960` - Added OpenAI branch in `onRegenerate`
- `app/page.tsx:996-997` - Added OpenAI branch in `onGenerateCarousel`

All now route to `callGenerate` which checks `activeProviderRef.current` and hits `/api/generate-openai` when provider is `'openai'`.

### 4. "Generating with Gemini" Hardcoded
**Fixed:** Made label dynamic based on active provider
- `app/components/nodes/OutputNode.tsx:25-31` - Added `providerLabel` computed from `activeProvider`
- `app/components/nodes/OutputNode.tsx:131` - Changed to `Generating with {providerLabel}…`

Now shows:
- "Generating with Nano Banana…" (Gemini)
- "Generating with OpenAI Image…" (OpenAI)
- "Generating with EccoAPI…" (Ecco)
- "Generating with Pudding…" (Pudding)

### 5. API Key Verified
**Verified:** `OPENAI_API_KEY` exists in `.env.local:9`
- Key format: `sk-proj-...` (valid project key format)

### 6. Extended directorParser for OpenAI Params
**Fixed:** Added OpenAI-specific param parsing
- `app/lib/directorParser.ts:220-251` - Extended `extractApiTag()` to parse `quality`, `size`, `output_format`, `background`, `n`

### 7. Chat Provider Selection
**Fixed:** Added provider selector to chat interface
- `app/lib/chatStore.ts:38` - Added `provider?: 'gemini' | 'openai'` to Chat interface
- `app/components/chat/ChatDrawer.tsx:48` - Added `provider` to ClientContext
- `app/components/chat/ChatDrawer.tsx:195` - Provider flows through `buildClientContext()`
- `app/components/chat/ChatDrawer.tsx:706-712` - Added ProviderSelector to chat header

## Testing Checklist

- [x] Structured questions render as chips (not tool errors)
- [x] OpenAI generation routes to `/api/generate-openai`
- [x] No Gemini params leak to OpenAI (model='Flash' fixed)
- [x] OutputNode shows correct provider label
- [x] Chat provider selector works
- [ ] **User test:** Generate image with OpenAI provider selected
- [ ] **User test:** Verify no 400/401 errors

## Known Limitations

1. **No streaming for OpenAI** - `callGenerate` doesn't support SSE for OpenAI yet (only Gemini has streaming)
2. **Settings UI** - Node settings panels still show Gemini-specific controls (temperature/topP/topK) when OpenAI is active. Should show quality/size/format instead.
3. **Reference images** - OpenAI image-to-image not yet researched/implemented

## Next Steps (Optional Enhancements)

1. Add OpenAI-specific settings UI (quality/size/format controls)
2. Implement settings mapper to convert Gemini ↔ OpenAI params
3. Research OpenAI reference image handling
4. Add streaming support for OpenAI if API supports it
