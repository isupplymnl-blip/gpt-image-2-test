# Phase 3: Chat Director - Implementation Status

**Date:** 2026-04-27  
**Status:** Partially Implemented

---

## Phase 3 Requirements (from GPT_IMAGE_2_INTEGRATION_STUDY.md)

### ✅ DONE
1. **Create OpenAI-optimized prompt templates**
   - ✅ `app/lib/prompts/openai-director.ts` exists
   - ✅ `app/lib/prompts/gemini-director.ts` exists
   - ✅ `app/api/chat/route.ts` uses `getSystemPromptForProvider()` to select correct prompt

2. **Provider-specific build blocks**
   - ✅ Both prompts define provider-specific guidance
   - ✅ API tag format documented for each provider

### ❌ NOT DONE
1. **Add provider selection Q&A at conversation start**
   - ❌ ChatDrawer.tsx has NO provider selection logic
   - ❌ No "Which provider?" question at chat start
   - ❌ No provider state stored in Chat object

2. **Update API tag parser to handle OpenAI format**
   - ❌ `app/lib/directorParser.ts` only parses Gemini params (temperature, topP, topK, seed)
   - ❌ Missing OpenAI params: quality, size, output_format, background, n

---

## Current Implementation Details

### ✅ What Works
- **Provider abstraction layer** (`app/lib/providers/`) exists with Gemini + OpenAI implementations
- **System prompts** switch based on provider
- **ProviderSelector component** exists (`app/components/ProviderSelector.tsx`)
- **API route** accepts `provider` in `clientContext`

### ❌ What's Missing

#### 1. Chat Provider Selection Flow
**Location:** `app/components/chat/ChatDrawer.tsx`

**Current state:** No provider selection logic at all

**Needed:**
```typescript
// Add to Chat interface in chatStore.ts
interface Chat {
  // ... existing fields
  provider?: 'gemini' | 'openai'; // NEW
}

// Add to ChatDrawer.tsx
const [chatProvider, setChatProvider] = useState<ProviderType>('gemini');

// First message flow
if (active.messages.length === 0) {
  // Show provider selection before first message
  return <ProviderSelectionPrompt onSelect={(p) => {
    setChatProvider(p);
    updateChat({ ...active, provider: p });
  }} />;
}
```

#### 2. API Tag Parser for OpenAI
**Location:** `app/lib/directorParser.ts:220-251`

**Current state:** Only parses Gemini params

**Needed:**
```typescript
export function extractApiTag(text: string): {
  // Gemini params
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  // OpenAI params (NEW)
  quality?: 'low' | 'medium' | 'high';
  size?: string;
  output_format?: 'png' | 'jpeg' | 'webp';
  background?: 'transparent' | 'opaque' | 'auto';
  n?: number;
} | null {
  // ... parse both Gemini and OpenAI formats
}
```

#### 3. Provider Context in Chat API
**Location:** `app/api/chat/route.ts`

**Current state:** Accepts `provider` in clientContext but doesn't pass it through consistently

**Needed:**
- Ensure `provider` from Chat object flows to API route
- Pass provider to `buildSystemPrompt()`

---

## Branding Issue

### Current State
Both system prompts say:
```
"You are the Nano Banana Director..."
```

### Required Change
Replace with:
```
"I am your chat agent with this AI Studio created by iSupply."
```

**Files to update:**
1. `app/lib/prompts/gemini-director.ts:7`
2. `app/lib/prompts/openai-director.ts:7`
3. `app/components/ProviderSelector.tsx:22` (remove "Nano Banana" label)

---

## Implementation Checklist

### High Priority (Phase 3 Core)
- [ ] **Rebrand chat agent** (remove "Nano Banana Director")
- [ ] **Add provider selection at chat start** (ChatDrawer.tsx)
- [ ] **Store provider in Chat object** (chatStore.ts)
- [ ] **Update API tag parser** for OpenAI params (directorParser.ts)
- [ ] **Pass provider from chat to API route** (ChatDrawer.tsx → route.ts)

### Medium Priority (Phase 3 Polish)
- [ ] Show provider badge in chat header
- [ ] Allow changing provider mid-conversation
- [ ] Validate API tags match selected provider

### Low Priority (Nice to Have)
- [ ] Provider-specific follow-up suggestions
- [ ] Cost estimation per provider in chat
- [ ] A/B comparison tool

---

## Estimated Effort

**Remaining work:** 4-6 hours
- Rebrand: 30 min
- Provider selection UI: 2 hours
- API tag parser update: 1 hour
- Integration + testing: 1-2 hours

---

## Next Steps

1. ✅ Rebrand system prompts (remove "Nano Banana")
2. ✅ Update ProviderSelector label
3. ⏳ Add provider selection to ChatDrawer
4. ⏳ Extend directorParser for OpenAI params
5. ⏳ Test end-to-end with both providers
