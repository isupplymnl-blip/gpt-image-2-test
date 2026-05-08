# iThink OpenAI Sub-Provider — 554 Diagnostic

**Status:** route works in isolated probes, fails intermittently in dev server with HTTP **554**. Root cause not yet pinned. Pass to next dev.

## What we built

New sub-provider **iThink OpenAI** under the OpenAI provider group. Same upstream shape as `pudding-openai` — only base URL + auth token differ.

- Route: `app/api/ithink-openai/route.ts` (clone of `app/api/pudding-openai/route.ts`)
- Env: `ITHINK_OPENAI_API_KEY`, `ITHINK_OPENAI_BASE_URL` (default `https://token.ithinkai.cn`)
- Provider type added to `app/lib/providers/types.ts`:
  ```ts
  export type ProviderType = 'gemini' | 'openai' | 'ecco' | 'pudding' | 'pudding-openai' | 'ithink-openai';
  ```
- UI wired in `app/page.tsx`, all node components, chat window, migration modal, system prompts.

## What is "554"?

**Non-standard HTTP code.** Not in RFC 7231. Emitted by the One-API / New-API gateway (`X-Oneapi-Request-Id`, `X-New-Api-Version` headers identify it) as a generic upstream/channel failure. Common triggers:

1. Upstream OpenAI returned 5xx → gateway translates to 554.
2. Content moderation (PRC) silently blocked the request.
3. Gateway-side timeout before upstream finished.
4. Edge proxy (Cloudflare / EdgeOne) cut the connection.

Body usually empty or single line. **It is not "the server is down"** — it is "channel error, look upstream."

## What works

| Test | Refs | Settings | Result |
|------|------|----------|--------|
| `images/generations` no refs | 0 | default | 200 OK |
| `images/edits` 1 ref synthetic | 1 | default | 200 OK |
| `images/edits` 5 refs synthetic | 5 × 1024² | `quality:high, size:auto, jpeg, opaque` | 200 OK 43s |
| `images/edits` proxy-generated face | 1 | user's failing settings | 200 OK 43s |
| **`images/edits` user's 3 actual assets + 2 generated** | **5 × ~1.5 MB ea** | **user's failing settings + 2845-char prompt** | **200 OK 55.5s** |

Probe script: `C:\tmp\ithink-replay.mjs`. Reads user's actual ref files from disk, builds same multipart, hits iThink direct from Node — **succeeds**.

## What fails

User's production flow through dev server: HTTP 554 at ~95s. Same refs, same settings, same prompt as the passing direct-Node probe.

## Fixes already applied

1. **Multipart field name**: changed `image[]` → repeated singular `image` (OpenAI multipart spec / iThink expects this; `image[]` is Pudding-specific).
2. **`maxDuration`**: 60 → 300 (Next.js route timeout).
3. **Content-Type boundary probe**: warns if `FormData` fails to set boundary.
4. **Response shape handling**: iThink returns `url` (hosted at gateway CDN), not `b64_json`. Added `persistImageItem()` that downloads `url` bytes and writes to local `getGeneratedDir()`. Without this, even 200 responses silently failed at `Buffer.from(undefined, 'base64')`.
   ```ts
   async function persistImageItem(item, format) {
     let buffer;
     if (item.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
     else if (item.url) {
       const res = await fetch(item.url);
       buffer = Buffer.from(await res.arrayBuffer());
     } else throw new Error('missing b64_json and url');
     // ... write to disk, return /api/generated/<filename>
   }
   ```

## What we ruled out

- **Multipart format** — singular `image` field confirmed working.
- **Settings combo** (`size:auto, quality:high, background:opaque, output_format:jpeg`) — works in probes.
- **Face content** — face refs pass moderation in probes.
- **5-ref load** — passes in probes at full 1024² resize, with prompt of similar length.
- **User's actual ref files** — pass in direct-Node probe.

## Suspects still open

1. **Dev server vs Node fetch difference.** Probe uses Node 24 native `fetch` directly. Next.js dev server may use undici with different agent / keepalive / timeout behavior. Worth testing:
   - `process.env.UNDICI_HEADERS_TIMEOUT`, `UNDICI_BODY_TIMEOUT`.
   - Whether `next dev` HMR / route compilation injects intermediate latency that bumps total time over iThink's edge timeout (~90s ceiling observed).
2. **TLS / corporate proxy.** Windows TLS revocation issues bypassed in curl with `--ssl-no-revoke`. Node may hit similar issue in dev server context but not in plain script — unclear why.
3. **Gateway rate limit per-IP per-window.** User's 554 happens after multiple back-to-back attempts. Direct probes ran in isolation. Burst behavior not yet reproduced.
4. **Specific gateway routing.** Each request gets a different `X-Oneapi-Request-Id`. The 554 responses likely have a different upstream channel selected. Without access to gateway dashboard, cannot confirm which channel is breaking.

## Reproduction recipe (for next dev)

```bash
# 1. Direct probe — should succeed
cp C:/tmp/ithink-replay.mjs ./ithink-replay.mjs
node ithink-replay.mjs
rm ithink-replay.mjs

# 2. Through dev server — may 554
npm run dev
# In another terminal:
curl -X POST http://localhost:3000/api/ithink-openai \
  -H "Content-Type: application/json" \
  -d '{"prompt":"<same long prompt>","settings":{"size":"auto","quality":"high","background":"opaque","output_format":"jpeg"},"referenceImages":["/api/uploads/asset-1777970428997-m2sj6e0.png", ...]}'
```

If step 1 passes and step 2 returns 554, the gap is between Next.js route runtime and the iThink edge — that is where to dig next.

## Files touched

- `app/api/ithink-openai/route.ts` (created)
- `app/lib/providers/types.ts` (line 6, union extended)
- `app/context/StudioContext.ts` (provider unions)
- `app/page.tsx` (PROVIDERS list, cycle, apiEndpoint, callIThinkOpenaiGenerateStream, sidebar gating)
- `app/components/nodes/{PromptNode,CarouselPromptNode,ModelCreationNode,SettingNode,OutputNode}.tsx` (provider gating)
- `app/components/chat/ChatWindow.tsx` (PROVIDER_LABELS, PROVIDER_COLOR)
- `app/components/canvas/CanvasMigrationModal.tsx` (PROVIDER_LABEL)
- `app/api/chat/route.ts` (loadSkill, OpenAI prompt branch, providerLabels)
- `app/lib/directorParser.ts` (line 296, activeIsOpenAI)
- `.env.local` (`ITHINK_OPENAI_API_KEY`, optional `ITHINK_OPENAI_BASE_URL`)
