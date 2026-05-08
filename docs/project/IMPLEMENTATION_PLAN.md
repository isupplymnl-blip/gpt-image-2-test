# GPT-Image-2 Implementation Plan

**Project:** Nano Banana Studio - GPT-Image-2 Integration Test  
**Date:** 2026-04-26  
**Status:** Planning Phase

---

## Decisions Confirmed

### Decision 1: Provider Selection (Option A - Global with Per-Node Override)
**Implementation:** Same pattern as Pudding/Gemini/EccoAPI switching
- Global provider setting in config
- When user clicks "GPT-Image-2", all settings UI changes
- Different parameter sets per provider:
  - **Gemini:** temperature, topP, topK, seed, model
  - **GPT-Image-2:** quality, size, output_format, background, n

### Decision 2: Chat Director (Option A - Ask Every Time)
**Implementation:** Provider selection at conversation start
- First message: "Which provider? [Nano Banana (Gemini)] [GPT-Image-2]"
- Generate provider-specific prompts
- Different API tag formats per provider

### Decision 3: Canvas Migration (Pop-up with Options)
**Implementation:** When opening canvas with different provider
```
⚠️ Provider Mismatch Detected

This canvas was created with: Gemini
Current global setting: GPT-Image-2

What would you like to do?

○ Keep existing nodes as-is (Gemini)
  New nodes will use GPT-Image-2

○ Use global provider for all nodes (GPT-Image-2)
  All nodes will switch to GPT-Image-2

○ Migrate all nodes to GPT-Image-2
  Convert Gemini settings → GPT-Image-2 settings
  (temperature → quality mapping)

[Cancel] [Apply]
```

---

## Test Project Structure

```
gpt-image-2-test/
├── app/
│   ├── api/
│   │   ├── generate-openai/
│   │   │   └── route.ts          # NEW: OpenAI generation endpoint
│   │   ├── generate/
│   │   │   └── route.ts          # MODIFIED: Add provider routing
│   │   └── config/
│   │       └── route.ts          # MODIFIED: Add OpenAI key detection
│   ├── lib/
│   │   ├── providers/
│   │   │   ├── index.ts          # NEW: Provider abstraction
│   │   │   ├── gemini.ts         # NEW: Gemini provider implementation
│   │   │   ├── openai.ts         # NEW: OpenAI provider implementation
│   │   │   └── types.ts          # NEW: Shared provider types
│   │   ├── settingsMapper.ts    # NEW: Convert Gemini ↔ OpenAI settings
│   │   └── chatToolBridge.ts    # MODIFIED: Provider-aware tool dispatch
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── ModelCreationNode.tsx  # MODIFIED: Provider selector
│   │   │   ├── SettingNode.tsx        # MODIFIED: Provider selector
│   │   │   ├── PromptNode.tsx         # MODIFIED: Provider selector
│   │   │   └── CarouselNode.tsx       # MODIFIED: Provider selector
│   │   ├── chat/
│   │   │   ├── ChatDrawer.tsx         # MODIFIED: Provider Q&A
│   │   │   └── ProviderSelector.tsx   # NEW: Provider selection UI
│   │   ├── modals/
│   │   │   └── CanvasMigrationModal.tsx  # NEW: Migration dialog
│   │   └── settings/
│   │       └── ProviderSettings.tsx   # NEW: Provider config UI
│   └── context/
│       └── StudioContext.ts       # MODIFIED: Add provider state
├── docs/
│   ├── MIGRATION_GUIDE.md         # User-facing migration guide
│   └── PROVIDER_COMPARISON.md     # Gemini vs GPT-Image-2 comparison
└── .env.local.example             # Add OPENAI_API_KEY

COPY FROM MAIN PROJECT (unchanged):
├── app/lib/storage.ts
├── app/lib/tagMatcher.ts
├── app/lib/chatStore.ts
├── app/lib/directorParser.ts
└── All other unchanged files
```

---

## Implementation Phases

### Phase 1: Provider Abstraction Layer (6-8 hours)
**Goal:** Create clean provider interface

**Files to create:**
1. `app/lib/providers/types.ts` - Shared interfaces
2. `app/lib/providers/gemini.ts` - Wrap existing Gemini logic
3. `app/lib/providers/openai.ts` - New OpenAI implementation
4. `app/lib/providers/index.ts` - Provider factory
5. `app/lib/settingsMapper.ts` - Convert settings between providers

**Key interfaces:**
```typescript
interface ImageProvider {
  name: 'gemini' | 'openai';
  generate(params: GenerateParams): Promise<GeneratedImage>;
  edit?(params: EditParams): Promise<GeneratedImage>;
  validateSettings(settings: ProviderSettings): boolean;
}

interface GenerateParams {
  prompt: string;
  referenceImages?: string[];
  settings: ProviderSettings;
}

type ProviderSettings = GeminiSettings | OpenAISettings;

interface GeminiSettings {
  provider: 'gemini';
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  seed?: number;
}

interface OpenAISettings {
  provider: 'openai';
  model: string;
  quality: 'low' | 'medium' | 'high';
  size: string;
  output_format: 'png' | 'jpeg' | 'webp';
  background?: 'transparent' | 'opaque' | 'auto';
  n?: number;
}
```

### Phase 2: API Routes (4-6 hours)
**Goal:** Add OpenAI endpoint and routing logic

**Files to create/modify:**
1. `app/api/generate-openai/route.ts` - New OpenAI endpoint
2. `app/api/generate/route.ts` - Add provider routing
3. `app/api/config/route.ts` - Detect OpenAI key

**Routing logic:**
```typescript
// app/api/generate/route.ts
export async function POST(req: NextRequest) {
  const { provider, ...params } = await req.json();
  
  if (provider === 'openai') {
    return fetch('/api/generate-openai', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
  
  // Existing Gemini logic
  return generateWithGemini(params);
}
```

### Phase 3: Node UI Updates (6-8 hours)
**Goal:** Add provider selector to all nodes

**Files to modify:**
1. `app/components/nodes/ModelCreationNode.tsx`
2. `app/components/nodes/SettingNode.tsx`
3. `app/components/nodes/PromptNode.tsx`
4. `app/components/nodes/CarouselNode.tsx`

**UI changes:**
```tsx
// Add to each node
<ProviderSelector
  value={nodeData.provider || globalProvider}
  onChange={(provider) => {
    updateNodeData({ provider });
    // Show appropriate settings for provider
  }}
/>

{nodeData.provider === 'gemini' && (
  <GeminiSettings settings={nodeData.geminiSettings} />
)}

{nodeData.provider === 'openai' && (
  <OpenAISettings settings={nodeData.openaiSettings} />
)}
```

### Phase 4: Chat Director Integration (4-6 hours)
**Goal:** Provider-aware prompt generation

**Files to modify:**
1. `app/components/chat/ChatDrawer.tsx`
2. `app/lib/chatToolBridge.ts`
3. `app/api/chat/route.ts`

**Chat flow:**
```typescript
// First message in new chat
if (isFirstMessage) {
  await askProviderPreference();
  // User selects: Gemini or OpenAI
  storeProviderChoice(chatId, provider);
}

// Generate provider-specific prompts
const systemPrompt = provider === 'gemini'
  ? GEMINI_DIRECTOR_PROMPT
  : OPENAI_DIRECTOR_PROMPT;
```

### Phase 5: Canvas Migration (4-5 hours)
**Goal:** Handle provider mismatches

**Files to create:**
1. `app/components/modals/CanvasMigrationModal.tsx`
2. `app/lib/canvasMigration.ts`

**Migration logic:**
```typescript
function detectProviderMismatch(canvas: Canvas, globalProvider: Provider) {
  const nodeProviders = canvas.nodes.map(n => n.data.provider);
  const hasGemini = nodeProviders.includes('gemini');
  const hasOpenAI = nodeProviders.includes('openai');
  
  if (hasGemini && globalProvider === 'openai') {
    return { mismatch: true, from: 'gemini', to: 'openai' };
  }
  if (hasOpenAI && globalProvider === 'gemini') {
    return { mismatch: true, from: 'openai', to: 'gemini' };
  }
  
  return { mismatch: false };
}

function migrateSettings(
  from: GeminiSettings,
  to: 'openai'
): OpenAISettings {
  // Map temperature → quality
  const quality = from.temperature > 0.8 ? 'high' 
    : from.temperature > 0.5 ? 'medium' 
    : 'low';
  
  return {
    provider: 'openai',
    model: 'gpt-image-2',
    quality,
    size: '1024x1024',
    output_format: 'png',
  };
}
```

### Phase 6: Settings UI (3-4 hours)
**Goal:** Global provider configuration

**Files to create:**
1. `app/components/settings/ProviderSettings.tsx`

**Settings panel:**
```tsx
<SettingsPanel>
  <h3>Image Generation Provider</h3>
  
  <RadioGroup value={globalProvider} onChange={setGlobalProvider}>
    <Radio value="gemini">
      Nano Banana (Gemini)
      {!hasGeminiKey && <Badge>API Key Required</Badge>}
    </Radio>
    <Radio value="openai">
      GPT-Image-2 (OpenAI)
      {!hasOpenAIKey && <Badge>API Key Required</Badge>}
    </Radio>
  </RadioGroup>
  
  {globalProvider === 'gemini' && <GeminiDefaults />}
  {globalProvider === 'openai' && <OpenAIDefaults />}
</SettingsPanel>
```

### Phase 7: Testing & Documentation (4-6 hours)
**Goal:** Ensure everything works

**Tasks:**
1. Test Gemini generation (ensure no regression)
2. Test OpenAI generation
3. Test provider switching
4. Test canvas migration
5. Test chat director with both providers
6. Write user documentation
7. Write developer documentation

---

## Environment Setup

### .env.local.example
```bash
# Existing
GEMINI_API_KEY=your_gemini_key_here
ECCO_API_KEY=your_ecco_key_here
PUDDING_API_KEY=your_pudding_key_here

# NEW
OPENAI_API_KEY=your_openai_key_here

# Provider selection (optional, defaults to gemini)
AI_PROVIDER=gemini  # or 'openai'
```

---

## Testing Checklist

### Unit Tests
- [ ] Provider abstraction layer
- [ ] Settings mapper (Gemini ↔ OpenAI)
- [ ] API routing logic
- [ ] Canvas migration logic

### Integration Tests
- [ ] Generate with Gemini (no regression)
- [ ] Generate with OpenAI
- [ ] Switch provider mid-session
- [ ] Open canvas with different provider
- [ ] Migrate canvas Gemini → OpenAI
- [ ] Migrate canvas OpenAI → Gemini

### E2E Tests
- [ ] Create model node with Gemini
- [ ] Create model node with OpenAI
- [ ] Chat director with Gemini
- [ ] Chat director with OpenAI
- [ ] Build blocks with both providers
- [ ] Carousel with mixed providers

---

## Rollout Strategy

### Stage 1: Internal Testing (Week 1)
- Deploy to test environment
- Test with small team
- Gather feedback on UX

### Stage 2: Beta Release (Week 2)
- Deploy to production with feature flag
- Invite select users to test
- Monitor error rates and costs

### Stage 3: Full Release (Week 3)
- Enable for all users
- Announce in changelog
- Provide migration guide

---

## Risk Mitigation

### Risk 1: OpenAI Rate Limits (5 IPM on Tier 1)
**Mitigation:**
- Show rate limit warning in UI
- Queue requests if limit hit
- Suggest upgrading to Tier 2+

### Risk 2: Cost Differences
**Mitigation:**
- Show cost estimate before generation
- Add budget alerts
- Default to "low" quality for testing

### Risk 3: Quality Differences
**Mitigation:**
- Side-by-side comparison tool
- Allow A/B testing
- Document differences in guide

### Risk 4: Breaking Existing Workflows
**Mitigation:**
- Keep Gemini as default
- Thorough migration testing
- Rollback plan ready

---

## Success Metrics

### Technical Metrics
- [ ] Zero regression in Gemini generation
- [ ] OpenAI generation success rate > 95%
- [ ] Provider switching works 100% of time
- [ ] Canvas migration success rate > 98%

### User Metrics
- [ ] User satisfaction with provider choice
- [ ] Adoption rate of GPT-Image-2
- [ ] Cost per generation comparison
- [ ] Quality satisfaction scores

---

## Next Steps

1. **Review this plan** - Get approval on approach
2. **Set up test project** - Copy necessary files
3. **Install OpenAI SDK** - `npm install openai`
4. **Start Phase 1** - Build provider abstraction
5. **Iterate** - Test each phase before moving forward

Ready to start implementation?
