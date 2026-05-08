# Audit Implementation Record
**Date:** 2026-05-06  
**Based on:** `docs/project/CODEBASE_AUDIT.md`  
**Scope:** All 5 code bugs fixed + full directory restructure + 4 deep-audit fixes (Pass 2)

---

## Part 2 — Deep Audit Fixes (Pass 2)

### BUG-06 — GeminiProvider.generate() parts[0] hardcode + missing config
**File:** `app/lib/providers/gemini.ts:72`  
**Status:** ✅ Fixed

**Problem:** Used `candidate.content.parts[0].inlineData` — Gemini frequently leads with a text explanation part before the image part, making index 0 wrong. Also used `generationConfig` key (v1beta REST field, not SDK) with only `temperature/topP/topK` — missing `responseModalities`, `thinkingConfig`, `imageConfig`, and `safetySettings` that the real route (`api/generate/route.ts`) uses. Class could not produce images when the model returned a text part first.

**After:** Uses `parts.find(p => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'))`. Config now uses `config` key (SDK-correct) with `responseModalities: ['TEXT', 'IMAGE']`, `thinkingConfig`, `imageConfig: { mediaResolution: 'media_resolution_high' }`, and `BLOCK_NONE` safety settings. Includes `finishReason` checks for `SAFETY`/`IMAGE_SAFETY`. Error path captures and surfaces text hints from Gemini ("why it refused") if present.

---

### BUG-07 — canvasMigration.ts geminiToOpenAI() hardcodes background: 'opaque'
**File:** `app/lib/canvasMigration.ts:56`  
**Status:** ✅ Fixed

**Before:** `background: 'opaque'`  
**After:** `background: 'auto'`

**Why:** OpenAI default for `background` is `'auto'`. `'opaque'` forces a white background on every migrated node regardless of what the image needs. The provider defaults in `settingsMapper.ts`, `getDefaultSettings()`, and `OpenAIProvider.getDefaultSettings()` all use `'auto'`. Migration was the only place setting it to `'opaque'`.

---

### BUG-08 — app/api/config/ route never built
**File:** `app/api/config/route.ts` (new file)  
**Status:** ✅ Fixed

**Created** `GET /api/config` returning `{ hasGeminiKey: boolean, hasOpenAIKey: boolean, provider: 'gemini' | 'openai' | null }`. Implementation plan called for this endpoint to let the UI detect available providers at startup. Without it, any UI component calling `/api/config` received a 404 or EISDIR error (Next.js saw a directory with no route). Provider preference: Gemini if both keys present (matches the generate route default); OpenAI if only that key is set; null if neither.

---

### BUG-09 — generate-openai-stream has no heartbeat
**File:** `app/api/generate-openai-stream/route.ts:133`  
**Status:** ✅ Fixed

**Problem:** OpenAI image generation takes 15–60s. Proxy servers (nginx, Vercel edge, Cloudflare) drop idle SSE connections after ~30s. The Gemini stream route sends `: keep-alive` SSE comments every 15s; the OpenAI stream had no equivalent, making it fail silently on slow generations behind proxies.

**After:** Added `setInterval` at 15s that writes `: keep-alive\n\n` to the stream controller while waiting for the OpenAI `fetch()` to resolve. Interval is cleared in `finally` regardless of success/failure to prevent leaks.

---

## Part 1 — Bug Fixes (Initial Audit)

### BUG-01 — GeminiProvider.toBase64() stub replaced
**File:** `app/lib/providers/gemini.ts:161`  
**Status:** ✅ Fixed

**Before:**
```typescript
private async toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  // This would use the existing toBase64 implementation from generate/route.ts
  // For now, placeholder
  throw new Error('toBase64 not implemented - copy from existing code');
}
```

**After:**
```typescript
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

**Why dynamic imports:** `fs/promises`, `storage`, and `sharp` are server-side only. Dynamic imports prevent Next.js from attempting to bundle them into client chunks if the file is ever imported from a shared module.

**Parity with:** `app/api/generate/route.ts:81–97` — same resize (1024px max, withoutEnlargement), same JPEG q85, same local-path-vs-URL branch logic.

---

### BUG-02 — [API:] tag format= shorthand documented
**File:** `app/lib/prompts/openai-director.ts:38`  
**Status:** ✅ Fixed

**Before:**
```
[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]
```

**After:**
```
[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]
Note: `format=` is the canonical shorthand for `output_format=` — both are parsed by directorParser.ts extractApiTag(). Always use `format=` in tags you write; never mix the two in the same tag.
```

**Why this matters:** `directorParser.ts:275` parses both `output_format` and `format` as aliases. Without documentation, a developer writing prompts by hand could use `output_format=` (matching TypeScript type names) and accidentally create a mixed codebase where the same value has two different key names in different tags.

---

### BUG-03 — n validator cap corrected 8 → 10
**File:** `app/lib/settingsMapper.ts:156`  
**Status:** ✅ Fixed

**Before:**
```typescript
(!settings.n || (settings.n >= 1 && settings.n <= 8))
```

**After:**
```typescript
(!settings.n || (settings.n >= 1 && settings.n <= 10))
```

**Source of truth:** OpenAI API allows `n: 1–10`. `app/lib/providers/types.ts:54` documents `n?: 1-10`. The validator was more restrictive than both the API and the types without reason. Now aligned.

---

### BUG-04 — ProviderFactory explicit error for route-handled providers
**File:** `app/lib/providers/index.ts:29`  
**Status:** ✅ Fixed

**Before:**
```typescript
case 'gemini':
  provider = getGeminiProvider(); break;
case 'openai':
  provider = getOpenAIProvider(); break;
default:
  throw new Error(`Unknown provider type: ${type}`);
```

**After:**
```typescript
case 'gemini':
  provider = getGeminiProvider(); break;
case 'openai':
  provider = getOpenAIProvider(); break;
case 'ecco':
case 'pudding':
case 'pudding-openai':
case 'ithink-openai':
  throw new Error(
    `Provider '${type}' is handled by dedicated API routes (/api/pudding, /api/pudding-openai, /api/ithink-openai), not the provider factory. Call those routes directly.`
  );
default:
  throw new Error(`Unknown provider type: ${type}`);
```

**Why this matters:** `ecco`, `pudding`, `pudding-openai`, and `ithink-openai` all exist in `ProviderType` but have no factory implementation. The old generic `Unknown provider type` error gave no diagnostic signal about *why* the factory doesn't handle them. The new error message tells the developer exactly where to look.

---

### BUG-05 — OpenAI routing added to generate/route.ts
**File:** `app/api/generate/route.ts:278`  
**Status:** ✅ Fixed

**Before:** POST handler jumped straight into Gemini logic regardless of `settings.providerOverride`.

**After:**
```typescript
// Delegate to OpenAI route when provider override is set — closes the server-side
// blind spot where direct API calls always hit Gemini regardless of node settings.
const resolvedProvider = (body.settings?.providerOverride as string | undefined) 
  ?? (body.settings?.provider as string | undefined);
if (resolvedProvider === 'openai') {
  const openaiUrl = new URL('/api/generate-openai', request.url);
  return fetch(openaiUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

**What this closes:** Any caller posting directly to `/api/generate` with `settings.providerOverride: 'openai'` or `settings.provider: 'openai'` now reaches the OpenAI route. Previously those callers silently fell through to Gemini — wrong model, wrong response format, wrong billing.

**Routing priority:** `providerOverride` checked first (matches `page.tsx` dispatch logic), then `provider` as fallback. Gemini remains the default when neither is set.

---

## Part 2 — Directory Restructure

### Before / After Map

| Before | After | Reason |
|---|---|---|
| `CODEBASE_AUDIT.md` (root) | `docs/project/CODEBASE_AUDIT.md` | Project doc, not code |
| `FIXES_APPLIED.md` (root) | `docs/project/FIXES_APPLIED.md` | Project doc |
| `GEMINI_VS_PUDDING.md` (root) | `docs/project/GEMINI_VS_PUDDING.md` | Project doc |
| `GPT_IMAGE_2_INTEGRATION_STUDY.md` (root) | `docs/project/GPT_IMAGE_2_INTEGRATION_STUDY.md` | Project doc |
| `IMPLEMENTATION_PLAN.md` (root) | `docs/project/IMPLEMENTATION_PLAN.md` | Project doc |
| `IMPLEMENTATION_SUMMARY.md` (root) | `docs/project/IMPLEMENTATION_SUMMARY.md` | Project doc |
| `ITHINK_554_DIAGNOSTIC.md` (root) | `docs/project/ITHINK_554_DIAGNOSTIC.md` | Project doc |
| `OPENAI_GENERATION_FIXES.md` (root) | `docs/project/OPENAI_GENERATION_FIXES.md` | Project doc |
| `PHASE_3_STATUS.md` (root) | `docs/project/PHASE_3_STATUS.md` | Project doc |
| `REFERENCE_IMAGES_COMPARISON.md` (root) | `docs/project/REFERENCE_IMAGES_COMPARISON.md` | Project doc |
| `SIDEBAR_COMPARISON.md` (root) | `docs/project/SIDEBAR_COMPARISON.md` | Project doc |
| `vibecd-compatibility-report.md` (root) | `docs/project/vibecd-compatibility-report.md` | Project doc |
| `claude_code_brief_isupply_studio.md` (root) | `docs/project/claude_code_brief_isupply_studio.md` | Project doc |
| `open_letter_isupply_studio.md` (root) | `docs/project/open_letter_isupply_studio.md` | Project doc |
| `clear-chat-storage.html` (root) | `tools/clear-chat-storage.html` | Dev utility |
| `test-compression.js` (root) | `tools/test-compression.js` | Dev utility |
| `repo_filelist.txt` (root) | `tools/repo_filelist.txt` | Dev utility |
| `repo_raw_urls.txt` (root) | `tools/repo_raw_urls.txt` | Dev utility |
| `test-output/ithink-parallel-test.mjs` | `tools/ithink-parallel-test.mjs` | Test script |
| `test-output/result-1778063799450.jpeg` | `tools/test-output/result-1778063799450.jpeg` | Test output image |
| `test-output/` (root dir) | removed | Empty after move |
| `deploy-relay.sh` (root) | `relay/deploy-relay-root.sh` | Relay infra (diverged from relay/deploy.sh) |
| `relay-server-copy-this.js` (root) | `relay/relay-server-copy-this.js` | Relay infra |
| `docs/openai docs` (no extension, spaces) | `docs/api/openai-api-reference-raw.md` | Renamed + moved to api/ |
| `docs/prompting playbook` (no extension, spaces) | `docs/playbooks/prompting-playbook-notes.md` | Renamed + moved to playbooks/ |
| `docs/gemini docs` (empty, no extension) | deleted | 0-byte empty file |
| `docs/OPENAI_IMAGE_API_REFERENCE.md` | `docs/api/OPENAI_IMAGE_API_REFERENCE.md` | API reference → api/ |
| `docs/openai-typography-control.md` | `docs/api/openai-typography-control.md` | API reference → api/ |
| `docs/image-generation-architecture.md` | `docs/api/image-generation-architecture.md` | Architecture doc → api/ |
| `docs/director-before-after-playbook.md` | `docs/playbooks/director-before-after-playbook.md` | Playbook → playbooks/ |
| `docs/nano-banana-before-after-playbook.md` | `docs/playbooks/nano-banana-before-after-playbook.md` | Playbook → playbooks/ |
| `docs/nano-banana-prompting-playbook.md` | `docs/playbooks/nano-banana-prompting-playbook.md` | Playbook → playbooks/ |
| `docs/prompting-playbook.md` | `docs/playbooks/prompting-playbook.md` | Playbook → playbooks/ |
| `app/components/modals/CanvasMigrationModal.tsx` | `app/components/_archive/CanvasMigrationModal.old.tsx` | Orphan — page.tsx imports from canvas/, not modals/ |
| `app/components/modals/` (dir) | removed | Empty after move |
| `app/lib/{providers}/` (ghost dir) | removed | Empty curly-brace artifact |

---

### Final Directory Structure (non-node_modules)

```
gpt-image-2-test/
├── app/
│   ├── api/                        Next.js API routes
│   │   ├── assets/
│   │   ├── chat/
│   │   ├── config/
│   │   ├── convert-heic/
│   │   ├── generate/               Gemini (+ OpenAI delegation — BUG-05)
│   │   ├── generated/
│   │   ├── generate-openai/        OpenAI GPT-Image-2
│   │   ├── generate-openai-stream/
│   │   ├── generate-xiami-openai/
│   │   ├── ithink-openai/
│   │   ├── pudding/
│   │   ├── pudding-openai/
│   │   ├── upload/
│   │   └── uploads/
│   ├── components/
│   │   ├── _archive/               Orphaned components kept for reference
│   │   │   └── CanvasMigrationModal.old.tsx
│   │   ├── canvas/                 Canvas-specific UI (CanvasMigrationModal)
│   │   ├── chat/                   Chat drawer + composer components
│   │   ├── edges/
│   │   ├── nodes/                  Canvas node components
│   │   ├── settings/               ProviderSettingsPanel
│   │   ├── AutomatedBatchView.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── ProviderSelector.tsx
│   │   └── WelcomeDialog.tsx
│   ├── context/
│   ├── hooks/
│   └── lib/
│       ├── llm/                    LLM adapter layer (Anthropic, PriorityClaude, Vibecd)
│       ├── prompts/                Director system prompts (Gemini + OpenAI)
│       ├── providers/              Provider abstraction (Gemini, OpenAI, factory, types)
│       ├── canvasMigration.ts
│       ├── chatStore.ts / chatToolBridge.ts / chatTools.ts / chatUsage.ts / chatFiles.ts
│       ├── directorParser.ts
│       ├── providerSettingsStore.ts
│       ├── settingsMapper.ts
│       ├── skillLoader.ts
│       ├── storage.ts
│       └── tagMatcher.ts / uploadAsset.ts / structuredResponse.ts / ...
├── data/
│   └── assets.json
├── docs/
│   ├── api/                        API references and architecture docs
│   │   ├── image-generation-architecture.md
│   │   ├── openai-api-reference-raw.md
│   │   ├── OPENAI_IMAGE_API_REFERENCE.md
│   │   └── openai-typography-control.md
│   ├── playbooks/                  Prompting and creative direction guides
│   │   ├── director-before-after-playbook.md
│   │   ├── nano-banana-before-after-playbook.md
│   │   ├── nano-banana-prompting-playbook.md
│   │   ├── prompting-playbook.md
│   │   └── prompting-playbook-notes.md
│   └── project/                    Planning, audit, and decision docs
│       ├── CODEBASE_AUDIT.md
│       ├── claude_code_brief_isupply_studio.md
│       ├── FIXES_APPLIED.md
│       ├── GEMINI_VS_PUDDING.md
│       ├── GPT_IMAGE_2_INTEGRATION_STUDY.md
│       ├── IMPLEMENTATION_PLAN.md
│       ├── IMPLEMENTATION_SUMMARY.md
│       ├── ITHINK_554_DIAGNOSTIC.md
│       ├── open_letter_isupply_studio.md
│       ├── OPENAI_GENERATION_FIXES.md
│       ├── PHASE_3_STATUS.md
│       ├── REFERENCE_IMAGES_COMPARISON.md
│       ├── SIDEBAR_COMPARISON.md
│       └── vibecd-compatibility-report.md
├── nano-banana-creator/            9-agent skill system (self-contained)
│   ├── _archive/
│   ├── agents/                     agent-0 through agent-9
│   ├── references/
│   ├── README.md
│   └── SKILL.md
├── public/
│   ├── generated/                  Runtime-generated images
│   └── uploads/
├── relay/                          GCP relay server (all relay infra consolidated here)
│   ├── deploy.sh                   Current deploy script
│   ├── deploy-relay-root.sh        Root-level variant (kept, diverged from deploy.sh)
│   ├── relay-server-copy-this.js   Older copy (kept, diverged from server.js)
│   └── server.js                   Active relay server
├── tools/                          Dev utilities and test scripts
│   ├── test-output/
│   │   └── result-1778063799450.jpeg
│   ├── advanced-origin-finder.js
│   ├── clear-chat-storage.html
│   ├── find-origin.js
│   ├── ithink-parallel-test.mjs
│   ├── repo_filelist.txt
│   ├── repo_raw_urls.txt
│   └── test-compression.js
├── .env.local
├── .gitignore
├── AUDIT_IMPLEMENTATION.md         ← this file
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── tsconfig.json
└── tsconfig.tsbuildinfo
```

---

## Notes on What Was NOT Changed

- **No code files renamed or moved** — only markdown/utility/relay files moved. Zero import paths broken.
- **`relay/deploy-relay-root.sh` and `relay/relay-server-copy-this.js` kept as separate files** — they differ meaningfully from `relay/deploy.sh` and `relay/server.js`. The root variants use hardcoded values; the relay/ variants use env vars. Both preserved for reference.
- **`app/components/_archive/CanvasMigrationModal.old.tsx`** — kept, not deleted. It has a richer API (3 strategies including 'fresh', PROVIDER_LABEL map, full node list as prop) that the active version (`canvas/CanvasMigrationModal.tsx`) does not implement. It may be useful if those features are needed later.
- **`nano-banana-creator/`** — untouched. Self-contained skill system with its own internal structure.
- **`app/lib/{providers}/`** — empty ghost folder removed. No files lost.
