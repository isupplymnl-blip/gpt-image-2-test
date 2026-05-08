# Uocode Sub-Provider Integration Plan

**Target:** add `uocode` as an OpenAI-compatible sub-provider alongside
`openai` (direct), `pudding-openai`, `ithink-openai`, `grsai`.
**Upstream:** `https://www.uocode.com/v1` — OpenAI-compatible, model `gpt-image-2` only.
**Scope:** server-side routes, provider type registration, settings panel entry,
`.env.local` keys. UI canvas/director flow unchanged.

---

## 1. Capability verified (tests 25-28)

| Test | Endpoint | Body | Time | Status |
|---|---|---|---|---|
| 25 | `/v1/images/generations` | JSON text-only (Japan slip) | 54s | ✅ b64_json returned |
| 26 | `/v1/images/generations` | JSON text-only (Vietnam lingerie) | 41s | ✅ b64_json returned |
| 27 | `/v1/images/generations` + `images:[{image_url}]` | JSON w/ data URL ref | 37s | ✅ 200 but **subject drift** (loose ref, not identity-anchored) |
| 28 | `/v1/images/edits` | multipart `image=@file` via OpenAI SDK | 279s | ✅ proper edit path |

**Conclusion:**
- Text-to-image → `/v1/images/generations`.
- Reference image / edit → `/v1/images/edits` (multipart). `images: []` on
  generations works but drifts.
- Only model exposed: `gpt-image-2`. Returns `b64_json`.
- TLS cert chain fails Windows revocation (`CRYPT_E_NO_REVOCATION_CHECK`).
  Dev needs `NODE_TLS_REJECT_UNAUTHORIZED=0` or `node --use-system-ca`.
  Production on Linux/Vercel: not an issue.

Docs: [uocode AI 生图 API 调用说明](https://www.uocode.com) — mirrors
`docs/api/OPENAI_IMAGE_API_REFERENCE.md` patterns.

---

## 2. Why a new sub-provider (not a flag on `openai`)

Same rationale as `pudding-openai` / `ithink-openai` / `grsai`:
- Different base URL + API key than `openai`.
- Different quirks (b64-only returns, single model, slower edits).
- Director prompts + settings mapping per-upstream have already diverged —
  a dedicated `ProviderType` keeps routing clean.

---

## 3. File checklist

### 3.1 New files

| Path | Purpose |
|---|---|
| `app/api/uocode-openai/route.ts` | Server route — mirrors `app/api/ithink-openai/route.ts` |
| `app/api/scrape-uocode/route.ts` *(optional)* | Only if we want a scrape-variant later; skip for v1 |

### 3.2 Modified files

| Path | Change |
|---|---|
| `app/lib/providers/types.ts` | Add `'uocode-openai'` to `ProviderType` union (line ~7) |
| `app/lib/providers/index.ts` | Add env check + factory branch for `uocode-openai` |
| `app/lib/settingsMapper.ts` | Add uocode-openai mapping (mirror `ithink-openai`) |
| `app/components/ProviderSelector.tsx` | Add entry to `providers` array |
| `app/components/settings/ProviderSettingsPanel.tsx` | Add label line ~126 |
| `app/page.tsx` | Register new provider in the routing switch that sends to `/api/<x>` |
| `.env.local` | Add `UOCODE_API_KEY`, `UOCODE_BASE_URL` |
| `.env.example` *(if present)* | Same, redacted |
| `docs/api/OPENAI_IMAGE_API_REFERENCE.md` | Append uocode notes (b64-only, single model) |

---

## 4. Route handler skeleton (`app/api/uocode-openai/route.ts`)

Mirror `app/api/ithink-openai/route.ts` exactly — only swap base URL + env var.
Key pieces to copy verbatim:
- `sseWrap` + heartbeat (avoids CF 524)
- `toBase64` + `persistImageItem`
- `buildRequest` branching on `hasRefs` (edits vs generations)
- Streaming path via `stream: true, partial_images: 3`
- `maxDuration = 800`

### Critical deltas vs iThink

```ts
const baseUrl = process.env.UOCODE_BASE_URL ?? 'https://www.uocode.com/v1';
const apiKey  = process.env.UOCODE_API_KEY;
const model   = (settings?.model as string) ?? 'gpt-image-2'; // only model available
```

### Edits path (multipart) — already identical to iThink

```ts
if (hasRefs) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', finalPrompt);
  form.append('size',   resolvedSize);
  form.append('quality', quality);
  if (moderation) form.append('moderation', moderation);
  for (let i = 0; i < refBuffers.length; i++) {
    form.append('image', new Blob([refBuffers[i]], { type: 'image/png' }), `ref-${i}.png`);
  }
  return { url: `${baseUrl}/images/edits`, init: { method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }, body: form } };
}
```

*(note `/images/edits` — `baseUrl` already includes `/v1`)*

### Generations path (JSON)

```ts
return {
  url: `${baseUrl}/images/generations`,
  init: {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: finalPrompt, ...openaiSettings }),
  },
};
```

---

## 5. Provider types registration

### `app/lib/providers/types.ts`

```ts
export type ProviderType =
  | 'gemini'
  | 'openai'
  | 'pudding-openai'
  | 'ecco'
  | 'pudding'
  | 'ithink-openai'
  | 'grsai'
  | 'uocode-openai'; // ← add
```

### `app/lib/providers/index.ts`

No new Provider class needed (routes are thin OpenAI proxies). Just
extend env gating:

```ts
getAvailableProviders(): ProviderType[] {
  const available: ProviderType[] = [];
  if (process.env.GEMINI_API_KEY) available.push('gemini');
  if (process.env.OPENAI_API_KEY) available.push('openai');
  if (process.env.UOCODE_API_KEY) available.push('uocode-openai'); // ← add
  return available;
}
```

---

## 6. Settings

Uocode accepts the standard OpenAI shape (`model`, `prompt`, `size`,
`quality`, `n`, `moderation`). Reuse `OpenAISettings` — no new type.

Constraints to encode in `settingsMapper.ts`:
- `model` locked to `gpt-image-2` (only one available)
- `size` ∈ `{ 1024x1024, 1536x1024, 1024x1536 }` per uocode docs §7.2
- `quality` ∈ `{ medium, high }` per docs (treat `low`/`auto` → `medium`)
- `output_format`: not advertised in docs — omit from request (gpt-image
  defaults to b64 PNG)

---

## 7. UI surface

### `app/components/ProviderSelector.tsx`

```ts
const providers: Array<{ value: ProviderType; label: string; icon: string }> = [
  { value: 'gemini',          label: 'Nano Banana',     icon: '🍌' },
  { value: 'openai',          label: 'OpenAI Image',    icon: '🤖' },
  { value: 'pudding-openai',  label: 'Pudding (OpenAI)', icon: '🤖' },
  { value: 'ithink-openai',   label: 'iThink (OpenAI)',  icon: '🤖' },
  { value: 'grsai',           label: 'GrsAI (OpenAI)',   icon: '🤖' },
  { value: 'uocode-openai',   label: 'Uocode (OpenAI)',  icon: '🤖' }, // ← add
];
```

### `app/components/settings/ProviderSettingsPanel.tsx`

Extend the label ternary around line 126:

```tsx
{tempProvider === 'uocode-openai' ? '🤖 Uocode (OpenAI)' :
 tempProvider === 'ithink-openai' ? '🤖 iThink (OpenAI)' : ...}
```

---

## 8. Env vars

### `.env.local`

```bash
UOCODE_API_KEY=sk-NpwmON4KNrmRWJGU7K42SQEQ3IIVBr6srvCAxV8v7q6HRzi6
UOCODE_BASE_URL=https://www.uocode.com/v1
```

`UOCODE_BASE_URL` is optional — the route handler defaults to the same
value. Expose it so users can pin to a mirror if uocode ever rotates hosts.

---

## 9. Routing: which `/api/<x>` does the page call?

`app/page.tsx` contains the dispatch that maps `ProviderType` → endpoint path.
Add a case:

```ts
function endpointForProvider(p: ProviderType): string {
  switch (p) {
    case 'gemini':         return '/api/generate';
    case 'openai':         return '/api/generate-openai-stream';
    case 'pudding':        return '/api/pudding';
    case 'pudding-openai': return '/api/pudding-openai';
    case 'ithink-openai':  return '/api/ithink-openai';
    case 'grsai':          return '/api/grsai';
    case 'uocode-openai':  return '/api/uocode-openai'; // ← add
  }
}
```

---

## 10. Director / prompt integration

**No changes needed** to `app/lib/prompts/openai-director.ts` or
`directorParser.ts`. The director emits standard OpenAI-shape payloads,
and the route handler fans those out to the upstream. Any uocode-specific
rewriting (e.g., mapping `quality=low` → `medium`) happens in the route
handler's settings mapping before the outbound fetch.

---

## 11. TLS note (dev-only)

Windows/Node has cert-chain revocation failures against uocode's TLS cert:

```
UNABLE_TO_VERIFY_LEAF_SIGNATURE
CRYPT_E_NO_REVOCATION_CHECK
```

**Dev workaround:** `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env.local`, or
start Next with `node --use-system-ca`. Do **not** ship this to production;
on Vercel/Linux it's not reproduced.

---

## 12. Comparison matrix (post-integration)

| Sub-provider | Base URL | Edits? | Streaming? | b64/url return | Speed (low/1024²) | Identity preservation |
|---|---|---|---|---|---|---|
| `openai` (direct) | api.openai.com | ✅ multipart | ✅ | both | ~15-30s | best |
| `pudding-openai` | pudding | ✅ `image[]` | ✅ | both | ~30-60s | good |
| `ithink-openai` | token.ithinkai.cn | ✅ `image` | ✅ | both | ~45-90s | good |
| `grsai` | grsaiapi.com | generations+`images[]` | ✅ | both | ~60-180s | medium (drift) |
| `uocode-openai` | www.uocode.com/v1 | ✅ `image` | ✅ | b64 only | ~40-60s | TBD (test 28 bathroom visual compare needed) |
| ~~`packyapi`~~ | www.packyapi.com | ❌ broken (sora group) | untested | url | ~210s | N/A |

---

## 13. Tests to re-run after wiring

1. `npm run dev` → open canvas → set provider to `Uocode (OpenAI)`.
2. PromptNode → plain text gen → expect b64 PNG persisted via `persistImageItem`.
3. UploadNode → add ref → PromptNode with ref-flag → expect `/images/edits`
   multipart in network tab.
4. Streaming UI: verify the SSE heartbeat path (re-run Vogue Vietnam prompt
   which was the CF-524 canary on packyapi — uocode handles it in 41s).

---

## 14. Out of scope for v1

- Responses API (`/v1/responses` with `tools:[{image_generation}]`) — doc §5.
  Useful for `gpt-4o`-driven prompt-then-gen flows, but the studio's director
  already does the prompt step client-side, so no value-add yet.
- Gemini native path (`/v1beta/models/{model}:generateContent`) — uocode
  exposes it, but we already have a dedicated Gemini provider.
- 4K sizes (`4096x*`) — `gpt-image-2` tops out at `1536x1024` per §7.2. If
  user requests 4K via size picker, clamp in settings mapper.

---

## 15. Reference scripts

Kept in `tools/scrape-tests/` for smoke-testing outside the app:

- `25-uocode-japan.mjs` — text-only gen
- `26-uocode-vietnam.mjs` — text-only with SSE-stream fallback
- `27-uocode-edit.mjs` — generations + `images:[{image_url}]` (drift case)
- `28-uocode-edits.mjs` — `/v1/images/edits` multipart via OpenAI SDK (canonical)

Run with `NODE_TLS_REJECT_UNAUTHORIZED=0 SIZE=1024x1024 QUALITY=low node <script>`.
