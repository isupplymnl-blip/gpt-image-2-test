# GPT-Image-2 Integration Study

**Date:** 2026-04-26  
**Purpose:** Analyze integration of OpenAI's GPT-Image-2 into Nano Banana Studio  
**Status:** ✅ Complete with full API documentation

---

## 1. GPT-Image-2 Technical Overview

### API Details
- **Model ID:** `gpt-image-2` (latest), `gpt-image-1.5`, `gpt-image-1`, `chatgpt-image-latest`
- **Endpoint:** `https://api.openai.com/v1/images/generations`
- **Edit Endpoint:** `https://api.openai.com/v1/images/edits`
- **Released:** April 21, 2026
- **Type:** Native reasoning-based image generation (not diffusion)

### Complete Request Parameters

#### Generation (`/v1/images/generations`)
```typescript
{
  model: "gpt-image-2" | "gpt-image-1.5" | "gpt-image-1" | "chatgpt-image-latest",
  prompt: string, // Max 32,000 characters for GPT image models
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "2560x1440" | "auto",
  quality?: "low" | "medium" | "high" | "auto",
  n?: 1-8, // Number of images (default: 1)
  output_format?: "png" | "jpeg" | "webp", // Default: png
  output_compression?: 0-100, // Optional file size control
  background?: "transparent" | "opaque" | "auto",
  user?: string // Optional user identifier for abuse monitoring
}
```

#### Edit (`/v1/images/edits`)
```bash
# Multipart form data
-F "model=gpt-image-2"
-F "image[]=@source.png"  # Can send multiple reference images
-F "prompt=Edit description"
-F "input_fidelity=high"  # Preserves first 5 images more closely
-F "size=1024x1024"
-F "quality=medium"
```

### Response Format
```typescript
{
  data: [{
    b64_json: string, // Base64 encoded image (URLs not supported)
    revised_prompt?: string // Actual prompt used by model
  }]
}
```

### cURL Examples

**Generation:**
```bash
curl https://api.openai.com/v1/images/generations \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A professional product shot of wireless earphones",
    "size": "1024x1024",
    "quality": "high",
    "output_format": "png"
  }' > response.json

# Decode response
jq -r '.data[0].b64_json' response.json | base64 --decode > output.png
```

**Edit:**
```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-2" \
  -F "image[]=@reference.png" \
  -F "prompt=Change background to white marble" \
  -F "input_fidelity=high"
```

### Error Codes
- **400:** Wrong payload format or Content-Type mismatch
- **401:** Invalid or missing API key
- **403:** Account verification required or image access not enabled
- **404:** Invalid endpoint path or unsupported model name
- **429:** Rate limit exceeded (see rate limits below)

### Pricing (Token-based)
- **Input tokens:** $8.00/million (cached: $2.00/million)
- **Output tokens:** $30.00/million
- **Text input:** $5.00/million (cached: $1.25/million)
- **Text output:** $10.00/million

**Per-image estimates (1024x1024):**
- Low: ~$0.006
- Medium: ~$0.053
- High: ~$0.211

### Rate Limits (Images Per Minute)
- **Free:** Not supported
- **Tier 1:** 5 IPM
- **Tier 2:** 20 IPM
- **Tier 3:** 50 IPM
- **Tier 4:** 150 IPM
- **Tier 5:** 250 IPM

### Key Differences from Gemini
| Feature | Gemini 3.1 Flash Image | GPT-Image-2 |
|---------|------------------------|-------------|
| Provider | Google | OpenAI |
| Endpoint | `/v1beta/models/{model}:generateContent` | `/v1/images/generations` |
| Request format | `contents` array with `parts` | Flat `prompt` string |
| Response format | `candidates[0].content.parts[0].inlineData` | `data[0].b64_json` |
| Quality levels | None (single quality) | low/medium/high |
| Max resolution | 1024x1024 | 2560x1440 (2K) |
| Multi-image | Via `generationConfig.candidateCount` | Via `n` parameter |
| Reference images | Via `parts` array with `inlineData` | Via `/v1/images/edits` endpoint |
| Pricing model | Per-request | Token-based |

---

## 2. Current Architecture Analysis

### Current Provider: Gemini (Google)
**Files using Gemini:**
- `app/api/generate/route.ts` - Main generation endpoint
- `app/api/pudding/generate/route.ts` - Pudding provider
- `app/components/nodes/ModelCreationNode.tsx` - Model node
- `app/components/nodes/PromptNode.tsx` - Prompt node
- `app/context/StudioContext.ts` - Studio context
- `app/api/config/route.ts` - Config endpoint

### Current Model Map
```typescript
const MODEL_MAP: Record<string, string> = {
  'Flash':     'gemini-3.1-flash-image-preview', // Nano Banana 2
  'Pro':       'gemini-3-pro-image-preview',      // Nano Banana Pro
  'Standard':  'gemini-2.5-flash-image',          // Nano Banana Standard
};
```

### Current Request Flow
1. Node (ModelCreationNode/PromptNode/CarouselNode) → 
2. `/api/generate` → 
3. Google GenAI SDK → 
4. Gemini API → 
5. Response with base64 image

---

## 3. Integration Requirements

### 3.1 All Nodes Need Updates

**Affected Nodes:**
- `ModelCreationNode.tsx` - Model reference generation
- `SettingNode.tsx` - Setting/background generation
- `PromptNode.tsx` - Single prompt generation
- `CarouselNode.tsx` - Multi-slide generation
- `OutputNode.tsx` - Display generated images

**Required Changes:**
- Add provider selection UI (Gemini vs OpenAI)
- Add quality selector for OpenAI (low/medium/high)
- Add output format selector (png/jpeg/webp)
- Handle different response formats

### 3.2 API Layer Changes

**New API Route Needed:**
`app/api/generate-openai/route.ts`

**Why separate route?**
- Different SDK: `openai` vs `@google/genai`
- Different request/response format
- Different error handling
- Different retry logic
- Easier to maintain separate providers

**Shared Logic:**
- Image persistence (`persistImage`)
- Reference image processing (`toBase64`)
- Tag matching (`findMatchingImages`)

### 3.3 Model Selection UI

**Current:** Dropdown with "Flash", "Pro", "Standard" (Gemini only)

**Proposed:** Two-tier selection
```
Provider: [Gemini ▼] [OpenAI ▼]

If Gemini selected:
  Model: [Flash ▼] [Pro ▼] [Standard ▼]

If OpenAI selected:
  Model: [GPT-Image-2 ▼]
  Quality: [Low ▼] [Medium ▼] [High ▼]
  Format: [PNG ▼] [JPEG ▼] [WebP ▼]
```

### 3.4 Chat Director Agent

**Current behavior:**
- Generates prompts optimized for Gemini
- Uses Gemini-specific terminology
- Outputs `[API: model=gemini-3.1-flash-image-preview, ...]`

**Required changes:**
- Add Q&A at start: "Which provider? [Gemini] [OpenAI]"
- Generate provider-specific prompts
- Output provider-specific API tags:
  - Gemini: `[API: model=gemini-3.1-flash-image-preview, temp=1.0, ...]`
  - OpenAI: `[API: model=gpt-image-2, quality=high, size=1024x1024, ...]`

### 3.5 Configuration & Environment

**New env vars needed:**
```bash
# .env.local
OPENAI_API_KEY=sk-...
AI_PROVIDER=gemini  # or 'openai'
```

**Config endpoint update:**
```typescript
// app/api/config/route.ts
{
  provider: 'gemini' | 'openai',
  hasGeminiKey: boolean,
  hasOpenAIKey: boolean,
}
```

---

## 4. Implementation Scope

### Phase 1: Core Infrastructure (Big)
- [ ] Install `openai` SDK: `npm install openai`
- [ ] Create `app/api/generate-openai/route.ts`
- [ ] Add `OPENAI_API_KEY` to env
- [ ] Update `app/api/config/route.ts` to detect OpenAI key
- [ ] Create provider abstraction layer

### Phase 2: Node Updates (Medium)
- [ ] Add provider selector to all generation nodes
- [ ] Add OpenAI-specific settings (quality, format)
- [ ] Update node state to store provider choice
- [ ] Handle different response formats per provider

### Phase 3: Chat Director (Medium)
- [ ] Add provider selection Q&A at conversation start
- [ ] Create OpenAI-optimized prompt templates
- [ ] Update API tag parser to handle OpenAI format
- [ ] Generate provider-specific build blocks

### Phase 4: UI/UX (Small)
- [ ] Add provider toggle in settings
- [ ] Show provider badge on generated images
- [ ] Add cost estimator per provider
- [ ] Update tooltips/help text

### Phase 5: Advanced Features (Optional)
- [ ] Support `/v1/images/edits` for image editing
- [ ] Multi-image generation (n=2-8)
- [ ] 2K resolution support (2560x1440)
- [ ] Output compression controls

---

## 5. Key Decisions Needed

### Decision 1: Provider Selection UX
**Option A:** Global setting (all nodes use same provider)
- Pros: Simple, consistent
- Cons: Can't mix providers in same canvas

**Option B:** Per-node setting (each node chooses provider)
- Pros: Flexible, can compare providers
- Cons: More complex UI, confusing for users

**Recommendation:** Option A (global setting) with per-node override

### Decision 2: Chat Director Behavior
**Option A:** Ask provider at start of every conversation
- Pros: Explicit, clear
- Cons: Annoying for repeat users

**Option B:** Use global setting, allow override via command
- Pros: Seamless, respects user preference
- Cons: User might forget which provider is active

**Recommendation:** Option B with clear indicator in chat header

### Decision 3: Backward Compatibility
**Question:** What happens to existing canvases with Gemini nodes?

**Answer:** 
- Keep existing nodes as-is (Gemini)
- New nodes default to global provider setting
- Add migration tool to convert Gemini → OpenAI if needed

---

## 6. Effort Estimate

### Is this a big adjustment?

**YES - This is a significant refactor.**

**Complexity factors:**
1. **Different API paradigm:** Gemini uses `contents` array, OpenAI uses flat `prompt`
2. **Different SDK:** Need to learn OpenAI SDK patterns
3. **Provider abstraction:** Need clean separation of concerns
4. **UI changes:** Every generation node needs updates
5. **Chat agent changes:** Prompt generation logic differs
6. **Testing:** Need to test both providers thoroughly

**Estimated effort:**
- Phase 1 (Core): 8-12 hours
- Phase 2 (Nodes): 6-8 hours
- Phase 3 (Chat): 4-6 hours
- Phase 4 (UI): 3-4 hours
- Testing: 4-6 hours

**Total: 25-36 hours of development**

### Risk factors:
- OpenAI API rate limits (5 images/min on Tier 1)
- Different error handling patterns
- Cost differences (token-based vs per-request)
- Quality differences between providers
- Breaking changes to existing workflows

---

## 7. Recommended Approach

### Step 1: Proof of Concept (2-3 hours)
- Create standalone `/api/generate-openai/route.ts`
- Test basic generation with GPT-Image-2
- Verify response format and image quality
- Compare with Gemini output

### Step 2: Provider Abstraction (4-6 hours)
- Create `app/lib/providers/` directory
- Abstract common interface:
  ```typescript
  interface ImageProvider {
    generate(params: GenerateParams): Promise<GeneratedImage>;
    edit?(params: EditParams): Promise<GeneratedImage>;
  }
  ```
- Implement `GeminiProvider` and `OpenAIProvider`

### Step 3: Incremental Rollout (15-20 hours)
- Update one node type at a time
- Test thoroughly before moving to next
- Keep Gemini as default during transition

### Step 4: Chat Director Integration (4-6 hours)
- Add provider awareness
- Generate provider-specific prompts
- Update build block parsing

### Step 5: Polish & Documentation (3-4 hours)
- Add user-facing documentation
- Create migration guide
- Update tooltips and help text

---

## 8. Sources

- [Full Developer Breakdown (2026)](https://www.buildfastwithai.com/blogs/chatgpt-images-2-0-gpt-image-2-2026)
- [OpenAI GPT-Image-2 Model Docs](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI Community Announcement](https://community.openai.com/t/introducing-gpt-image-2-available-today-in-the-api-and-codex/1379479)
- [How to Use GPT-Image-2](https://blog.laozhang.ai/en/posts/how-to-use-gpt-image-2)

---

## 9. Next Steps

**Before proceeding:**
1. Get OpenAI API key
2. Test GPT-Image-2 quality vs Gemini
3. Decide on provider selection UX (Decision 1)
4. Decide on chat director behavior (Decision 2)
5. Review effort estimate with team

**Ready to implement?**
- Start with Phase 1 (Core Infrastructure)
- Build proof of concept first
- Get user feedback before full rollout
