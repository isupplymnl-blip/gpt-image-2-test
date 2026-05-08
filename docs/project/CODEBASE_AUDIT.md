# Codebase Audit — GPT-Image-2 Integration
**Date:** 2026-05-06  
**Analyzer:** Claude Sonnet 4.6  
**Scope:** Implementation verification against IMPLEMENTATION_PLAN.md + GPT_IMAGE_2_INTEGRATION_STUDY.md

---

## Implementation Status by Phase

| Phase | Plan | Status | Notes |
|---|---|---|---|
| 1 — Provider Abstraction | types, gemini, openai, factory, mapper | ✅ Built | One stub, factory unused in hot path |
| 2 — API Routes | generate-openai route, routing logic | ✅ Built | Routing at page level, not inside /api/generate |
| 3 — Node UI | Provider selector on all nodes | ✅ Built | Per-node providerOverride in all 4 sidebars |
| 4 — Chat Director | Provider-aware system prompt | ✅ Built | Full openai-director.ts with GPT-Image-2 rules |
| 5 — Canvas Migration | Mismatch modal + migration logic | ✅ Built | 3-strategy modal, bidirectional converter |
| 6 — Settings UI | Global provider panel | ✅ Built | Zustand store, ProviderSettingsPanel |
| 7 — Rate Limiting | OpenAI 5 IPM queue | ✅ Built (bonus) | Sliding window singleton in useGenerationQueue |
| 8 — Tests | Unit + integration + E2E | ❌ Zero | All 7 checklist items unchecked |

---

## Bugs to Fix

### BUG-01 — GeminiProvider.toBase64() throws (Critical if class ever used)
**File:** `app/lib/providers/gemini.ts:163`  
**Severity:** High — silent landmine  
**What:** `toBase64()` throws `'not implemented'`. Safe today because `generate/route.ts` handles all generation directly and never calls the class. Becomes a hard crash if anything routes through `ProviderFactory`.

```typescript
// Current — throws
private async toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  throw new Error('toBase64 not implemented - copy from existing code');
}

// Fix — copy the working impl from generate/route.ts:81-97
private async toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const { readFile } = await import('fs/promises');
  const { urlToFilePath } = await import('../storage');
  const sharp = (await import('sharp')).default;

  let inputBuf: Buffer;
  if (urlOrPath.startsWith('/')) {
    inputBuf = await readFile(urlToFilePath(urlOrPath));
  } else {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status} ${urlOrPath}`);
    inputBuf = Buffer.from(await res.arrayBuffer());
  }
  const outputBuf = await sharp(inputBuf)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { data: outputBuf.toString('base64'), mimeType: 'image/jpeg' };
}
```

---

### BUG-02 — [API:] tag format mismatch between director and parser
**Files:** `app/lib/prompts/openai-director.ts:40` vs `app/lib/directorParser.ts:275`  
**Severity:** Medium — works by accident  
**What:** Director outputs `format=png` shorthand. Parser accepts both `output_format` and `format`. But any prompt hand-edited to use `output_format=` in the tag will be parsed correctly, while `format=` is the only thing the director ever writes. Inconsistent contract.

```
// Director outputs (line 40):
[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]

// Fix — standardize. Pick one. Recommend: keep format= in tag (shorter, director already uses it).
// In directorParser.ts:275, the alias is already there — no code change needed.
// In openai-director.ts, add a note that format= is the canonical tag shorthand.
// Action: Document this in openai-director.ts line 40 comment.
```

---

### BUG-03 — settingsMapper.ts validates n max as 8, types.ts says 1–10
**Files:** `app/lib/settingsMapper.ts:156` vs `app/lib/providers/types.ts:54`  
**Severity:** Low  
**What:** Validator rejects `n=9` or `n=10` even though OpenAI API and the type definition allow up to 10.

```typescript
// settingsMapper.ts:156 — current
(!settings.n || (settings.n >= 1 && settings.n <= 8))

// Fix
(!settings.n || (settings.n >= 1 && settings.n <= 10))
```

---

### BUG-04 — ProviderFactory throws for ecco/pudding/pudding-openai/ithink-openai
**File:** `app/lib/providers/index.ts:29`  
**Severity:** Low (factory unused in hot paths today)  
**What:** `createProvider('ecco')` throws `Unknown provider type`. These exist in `ProviderType` but have no factory case. If any future code uses the factory generically, ecco/pudding calls crash.

```typescript
// Fix option A — add stubs that throw a clear "not implemented" error
case 'ecco':
case 'pudding':
case 'pudding-openai':
case 'ithink-openai':
  throw new Error(`Provider '${type}' is handled by dedicated API routes, not the factory`);

// Fix option B — remove these from ProviderType and use a separate RouteProvider type
// for ecco/pudding/etc. Cleaner separation of concerns.
```

---

### BUG-05 — generate/route.ts has no OpenAI routing (server-side blind spot)
**File:** `app/api/generate/route.ts`  
**Severity:** Medium  
**What:** Plan called for provider routing inside `/api/generate`. Instead it was done in `page.tsx`. This means:
- Any server-side caller or webhook that posts to `/api/generate` always hits Gemini regardless of provider setting
- If `page.tsx` routing logic is ever bypassed (direct API call, test harness, cURL), OpenAI nodes silently fall back to Gemini

```typescript
// Fix — add provider check at top of POST handler in generate/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Delegate to OpenAI route if provider is openai
  if (body.settings?.providerOverride === 'openai' || body.provider === 'openai') {
    return fetch(new URL('/api/generate-openai', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  
  // existing Gemini logic...
}
```

---

## Architecture Observations

### The abstraction layer exists but is a ghost
`app/lib/providers/` (gemini.ts, openai.ts, index.ts) is built and type-correct but nothing in the active request path calls it. All generation goes:

```
page.tsx → /api/generate (Gemini)
page.tsx → /api/generate-openai (OpenAI)
```

The factory/class pattern was designed for `providers/index.ts → createProvider() → provider.generate()` but the actual flow skips it entirely. This is fine for now but means the abstraction provides zero runtime value — it's documentation-in-code, not working infrastructure.

**Decision required:** Either wire the routes to use the provider classes (more work, cleaner long-term) or explicitly acknowledge the routes are the real abstraction and delete/archive the provider classes to avoid confusion.

---

### Dual toBase64 implementations (diverged)
`generate/route.ts` uses JPEG q85 (Gemini-optimized, smaller tokens).  
`generate-openai/route.ts` uses PNG (OpenAI doesn't charge by token count on images, PNG is lossless).  
This divergence is **intentional and correct** — Gemini has a 14-image/20MB token budget per request, OpenAI charges per output image regardless of input size. Document this explicitly.

---

### OpenAI edit() uses generations endpoint, not edits
`providers/openai.ts:125` — `edit()` calls `client.images.generate()` not `client.images.edit()`.  
`generate-openai/route.ts:134` — correctly routes to `/v1/images/edits` when refs present.  

The class implementation and the route implementation are inconsistent. The route is correct. The class `edit()` is wrong but unused.

---

## Next Moves (Priority Order)

### Priority 1 — Fix the toBase64 stub (BUG-01)
**Why now:** Any future refactor that routes through ProviderFactory will crash in production with a confusing error. 30-minute fix, zero risk.

### Priority 2 — Add provider routing to generate/route.ts (BUG-05)
**Why now:** Closes the server-side blind spot before it becomes a debugging nightmare. Anyone running integration tests against the API directly will get wrong results.

### Priority 3 — Fix n validator (BUG-03)
**Why now:** One-liner. API allows 10, code blocks at 8. No reason to keep the discrepancy.

### Priority 4 — Decide: wire providers/ classes or archive them
**Why now:** Dead code that looks active creates confusion for the next developer. Either make it live or explicitly mark it archived. Recommend archiving — the route-level implementations are already battle-tested.

### Priority 5 — Write smoke tests for both providers
**Why now:** Zero test coverage on a multi-provider system. At minimum: one test that Gemini generation returns an image URL, one that OpenAI generation returns an image URL. CI safety net before the codebase grows further.

---

## Recommended Test Coverage

### Minimum viable test surface

```
tests/
├── api/
│   ├── generate.test.ts          # Gemini route: valid prompt → imageUrl in response
│   ├── generate-openai.test.ts   # OpenAI route: valid prompt → imageUrl, no refs → /generations, refs → /edits
│   └── chat.test.ts              # buildSystemPrompt: provider=openai → OPENAI_DIRECTOR, else → GEMINI_DIRECTOR
├── lib/
│   ├── settingsMapper.test.ts    # geminiToOpenAI, openAIToGemini roundtrip
│   ├── canvasMigration.test.ts   # detectProviderMismatch, all 3 migrate strategies
│   └── directorParser.test.ts   # extractApiTag: gemini tag, openai tag, mismatch warning
└── components/
    └── CanvasMigrationModal.test.tsx  # renders correct labels, calls onSelect with right strategy
```

### Critical edge cases to cover
- `extractApiTag` with `[API: model=gpt-image-2, quality=high]` on a Gemini-active session → `providerMismatch: true`
- `migrateCanvas` strategy=`migrate`, node provider=`gemini`, target=`openai` → settings converted, original Gemini fields removed
- `generate-openai` with empty `referenceImages` → hits `/generations` endpoint (not `/edits`)
- OpenAI rate limit queue: 6 concurrent requests → 5 proceed, 1 waits

---

## Quick Reference: What Is and Isn't Implemented

| Feature | Implemented | Location |
|---|---|---|
| OpenAI generation (text-to-image) | ✅ | `api/generate-openai/route.ts` |
| OpenAI generation (with ref images) | ✅ | Same route, auto-switches to /edits |
| Gemini generation | ✅ | `api/generate/route.ts` |
| Per-node provider override | ✅ | `page.tsx` sidebar, `providerOverride` setting |
| Global provider selector | ✅ | `ProviderSettingsPanel`, Zustand store |
| [API:] tag auto-fill (Gemini params) | ✅ | `directorParser.ts extractApiTag` |
| [API:] tag auto-fill (OpenAI params) | ✅ | Same |
| Provider mismatch warning in chat | ✅ | `directorParser.ts providerMismatchWarning` |
| Canvas migration modal | ✅ | `CanvasMigrationModal.tsx` |
| Rate limit queue (OpenAI 5 IPM) | ✅ | `useGenerationQueue.ts` |
| OpenAI director system prompt | ✅ | `prompts/openai-director.ts` |
| Gemini director system prompt | ✅ | `prompts/gemini-director.ts` |
| Provider abstraction classes (wired) | ❌ | `providers/` — built but unused in hot paths |
| Test coverage | ❌ | None |
| Server-side provider routing | ❌ | generate/route.ts always hits Gemini |
| OpenAI image edits via class | ❌ | `providers/openai.ts edit()` calls wrong endpoint |
| Cost estimator UI | ❌ | `estimateCost()` exists in classes, not surfaced in UI |
| Provider badge on generated images | ❌ | Not implemented |
| Rollout feature flag | ❌ | Not implemented (may be out of scope) |
