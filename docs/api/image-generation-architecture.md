# Image Generation Architecture

## Directory Map

```
app/
├── api/
│   ├── pudding/generate/route.ts       — Gemini Pudding endpoint (Nano Banana models)
│   └── pudding-openai/route.ts         — OpenAI Pudding endpoint (gpt-image-2)
├── lib/
│   ├── providers/
│   │   ├── types.ts                    — Provider interfaces, settings types, error classes
│   │   └── openai.ts                   — OpenAIProvider class (direct API, not Pudding)
│   ├── settingsMapper.ts               — Bidirectional Gemini ↔ OpenAI settings conversion
│   ├── pclaudeResolver.ts              — Vibe-claude proxy launcher/resolver (port 13151)
│   └── proxyFetch.ts                   — Drop-in fetch wrapper for OUTBOUND_PROXY_URL
```

---

## What "Pudding" Is

Both routes hit **apipudding.com** — a third-party proxy that provides cheaper access to Gemini Imagen and OpenAI gpt-image-2. Both routes use the same `PUDDING_API_KEY` and `PUDDING_BASE_URL` env vars.

```
PUDDING_API_KEY=...
PUDDING_BASE_URL=https://new.apipudding.com   (default if not set)
OUTBOUND_PROXY_URL=...                         (optional — routes all Pudding calls through a local proxy)
```

---

## Gemini Pudding (`/api/pudding/generate`)

### Model Resolution

The route does NOT call Gemini directly. It uses `GoogleGenAI` SDK pointed at the Pudding base URL:

```ts
new GoogleGenAI({
  apiKey: PUDDING_API_KEY,
  httpOptions: { baseUrl: PUDDING_BASE_URL, apiVersion: 'v1beta' },
})
```

Model names are internal Pudding aliases (Chinese-character strings), resolved from `tier + resolution`:

| tier | resolution | Pudding model alias |
|------|-----------|---------------------|
| flash | 1K | `[官逆C]Nano banana 2` |
| flash | 2K | `[官逆C]Nano banana 2-2k` |
| pro   | 1K | `[官逆C]Nano banana pro(大香蕉)` |
| pro   | 2K | `[官逆C]Nano banana pro-2k` |

`settings.model` → `flash` or `pro`. `settings.imageSize` → `1K` or `2K`.

### Two Generation Modes

**Slide** (default): generates a product/scene image.
- Calls `findMatchingImages(prompt)` to retrieve up to 14 tag-matched reference images from the asset library.
- Explicit `referenceUrls` from the request are prepended (deduped).
- Each reference image is fetched, resized to max 1024px JPEG 85% via `sharp`, and sent as `inlineData` parts.
- Prompt is wrapped with aspect ratio hint, negative prompt, and a quality tail (skipped for "Director" prompts that already have quality tags).

**Model-creation** (`type: 'model-creation'`): generates a multi-panel model composite.
- No reference image lookup.
- Detects number of models in description (1/2/3) → chooses 16:9 or 21:9 aspect ratio.
- Builds a prompt requesting 4 or 6 panels (front/back per model).

### Generation Config

```ts
{
  temperature,           // default 1.0
  topP?,                 // optional pass-through
  topK?,                 // optional pass-through (untested on Pudding)
  seed?,                 // optional pass-through (untested on Pudding)
  responseModalities: ['TEXT', 'IMAGE'],
  thinkingConfig: { includeThoughts },   // default true
  imageConfig: { aspectRatio, imageSize, mediaResolution },
  safetySettings,        // default BLOCK_NONE across all 4 harm categories
  tools?,                // optional Google Search / image search
}
```

### Streaming vs Non-Streaming

Both paths exist. Controlled by `useStreaming: boolean` in the request body.

**Streaming**: returns SSE (`text/event-stream`). Events:
- `heartbeat` — every 10s to prevent Cloudflare 524 timeouts
- `complete` — `{ imageUrl, nodeId, matchedRefs? }`
- `error` — `{ error: string }`

**Non-streaming**: returns JSON `{ success, imageUrl, matchedRefs, nodeId }`.

### Response Handling

`parseImageResponse` / `extractImageFromStream` extract `inlineData` image part from candidates. Explicit error messages for:
- `finishReason: SAFETY` → lists blocked categories
- `finishReason: IMAGE_SAFETY` → image (not prompt) was flagged
- Text returned instead of image → quotes the text

Image is saved to disk via `persistImage(base64)` → `getGeneratedDir()` + random filename, returns a local URL.

---

## OpenAI Pudding (`/api/pudding-openai`)

### How It Calls the API

Does NOT use the OpenAI SDK. Uses raw `fetch` (via `proxyFetch`) to Pudding's OpenAI-compatible endpoints:

```
POST {PUDDING_BASE_URL}/v1/images/generations   — no reference images
POST {PUDDING_BASE_URL}/v1/images/edits         — with reference images (multipart)
```

Quality is hardcoded to `high` because Pudding charges flat-rate:

```ts
quality: 'high',  // always — Pudding flat-rate makes this free upgrade
```

`input_fidelity` is explicitly excluded — it triggers a "Tool choice error" on Pudding.

### Reference Images

If `referenceImages` or `referenceUrls` are present in the request, the route switches to `/v1/images/edits` (multipart FormData). Each image is fetched and resized to max 1024px PNG via `sharp`.

### Retry Logic

3 attempts with delays `[0, 5000, 15000]` ms. Retries on HTTP 502, 503, 524. In streaming mode, sends `retrying` SSE event between attempts.

### Streaming vs Non-Streaming

Same SSE pattern as Gemini route. Events:
- `heartbeat` — every 10s
- `retrying` — `{ attempt, maxAttempts, delayMs }`
- `complete` — `{ imageUrl, revisedPrompt? }`
- `error` — `{ error: string }`

Non-streaming returns JSON `{ success, imageUrl, revisedPrompt, provider: 'pudding-openai' }`.

Response is `b64_json` — decoded and written to disk as `pudding-openai-{timestamp}.{format}`.

---

## OpenAI Provider (`app/lib/providers/openai.ts`)

This is a **separate class** (`OpenAIProvider`) that calls the **real OpenAI API directly** (not Pudding). Used by routes other than the Pudding routes.

- `generate()` → `client.images.generate()` → `/v1/images/generations`
- `edit()` → `client.images.edit()` → `/v1/images/edits` (up to 16 source images)
- Returns `GeneratedImage[]` with `base64` set; `url` is empty and set by the caller after persisting.

Error mapping: `OpenAI.APIError` → `AuthenticationError` (401/403), `RateLimitError` (429), `ProviderError` (all others).

Has `estimateCost()` based on quality tier + pixel count relative to 1024×1024 baseline.

---

## Settings (`app/lib/providers/types.ts`)

### GeminiSettings
```ts
{
  provider: 'gemini',
  model: string,        // 'Flash' or 'Pro' — mapped to Pudding alias in route
  temperature: number,  // 0.0–2.0
  topP: number,         // 0.0–1.0
  topK: number,         // 1–100
  seed?: number,
  resolution?: string,  // e.g. '1024x1024'
}
```

### OpenAISettings
```ts
{
  provider: 'openai',
  model: string,               // 'gpt-image-2'
  quality: 'low'|'medium'|'high'|'auto',
  size: string,                // 'auto' or 'WxH' — gpt-image-2 accepts flexible sizes
  output_format: 'png'|'jpeg'|'webp',
  background?: 'transparent'|'opaque'|'auto',
  moderation?: 'auto'|'low',
  n?: number,                  // 1–10
  output_compression?: number, // 0–100, jpeg/webp only
}
```

---

## Settings Mapper (`app/lib/settingsMapper.ts`)

Bidirectional conversion between provider settings. Used when switching providers in the UI.

| Conversion | Logic |
|---|---|
| Gemini temp → OpenAI quality | `≤0.5` → low, `≤1.0` → medium, `>1.0` → high |
| OpenAI quality → Gemini temp | low→0.3, medium→0.7, high→1.2, auto→0.9 |
| Gemini resolution → OpenAI size | Validates gpt-image-2 constraints (max edge 3840, multiples of 16, ratio ≤3:1, pixels 655K–8.3M); falls back to `1024x1024` |
| OpenAI size → Gemini resolution | Pass-through; `auto` → `1024x1024` |

---

## Proxy Infrastructure

### `proxyFetch.ts`
Drop-in `fetch` replacement. If `OUTBOUND_PROXY_URL` is set, routes all requests through an `undici` `ProxyAgent`. Handles `FormData` conversion for multipart requests. Used by `pudding-openai/route.ts`.

### `pclaudeResolver.ts`
Manages a local "vibe-claude" proxy on port 13151. Checks if running, auto-launches `vibe-claude.bat` once per process if not. Only relevant for local upstream URLs — external URLs pass through unchanged. Not used by the image generation routes directly.

---

## Request Flow

### Gemini Pudding (slide, streaming)
```
POST /api/pudding/generate
  { prompt, nodeId, settings, referenceUrls?, useStreaming: true }
  ↓
resolvePuddingModel(settings.model, settings.imageSize)
  → '[官逆C]Nano banana 2' (URL-encoded)
  ↓
buildSlideContents()
  → findMatchingImages(prompt)       — tag-matched asset refs
  → toBase64(each ref)               — sharp resize → JPEG base64
  → buildSlidePrompt(...)            — wraps prompt with ratio/quality hints
  ↓
sseWrap() opens SSE stream + heartbeat loop
  ↓
ai.models.generateContentStream({ model, contents, config })
  → Pudding proxy → Gemini Imagen
  ↓
extractImageFromStream()
  → persistImage(base64) → /generated/{timestamp}.png
  ↓
send('complete', { imageUrl, nodeId, matchedRefs })
```

### OpenAI Pudding (with reference images, streaming)
```
POST /api/pudding-openai
  { prompt, settings, referenceUrls: [...], useStreaming: true }
  ↓
toBase64(each ref) — sharp resize → PNG base64
  ↓
useEdits = true → endpoint: /v1/images/edits (multipart)
  ↓
sseWrap() opens SSE stream + heartbeat loop
  ↓
fetchWithRetry() — up to 3 attempts
  → proxyFetch(PUDDING_BASE_URL/v1/images/edits, FormData)
  → Pudding proxy → OpenAI gpt-image-2
  ↓
data.data[0].b64_json → writeFile → /generated/pudding-openai-{ts}.png
  ↓
send('complete', { imageUrl, revisedPrompt? })
```
