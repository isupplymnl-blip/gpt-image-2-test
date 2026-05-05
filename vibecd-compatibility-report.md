# vibecd Proxy Compatibility Report

**Date:** 2026-05-03  
**Reporter:** AI Studio GPT-Image-2 Test Project  
**Proxy Version:** vibe-claude.bat (port 13151)

---

## Issue Summary

vibecd proxy returns `400 Bad Request` with error message "会话内容解析异常" (session content parsing exception) when receiving standard Anthropic API payloads that include:

1. **Tools array** (`tools: [...]`)
2. **Extended thinking** (`thinking: { type: 'enabled', budget_tokens: N }`)
3. **Prompt caching markers** (`cache_control: { type: 'ephemeral' }`)

---

## Expected Behavior

Standard Anthropic API `/v1/messages` endpoint accepts:
- `tools` array for function calling
- `thinking` object for extended reasoning (Opus 4.7+)
- `cache_control` markers on system/messages/tools for prompt caching

Reference: https://docs.anthropic.com/en/api/messages

---

## Actual Behavior

vibecd proxy rejects payloads containing these fields with:
```
HTTP 400
{"code":"INVALID_REQUEST","error":"会话内容解析异常"}
```

---

## Reproduction

### Failing Payload (sent to `http://127.0.0.1:13151/v1/messages`)

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 5024,
  "system": [
    {
      "type": "text",
      "text": "You are a helpful assistant.",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true,
  "tools": [
    {
      "name": "list_canvas",
      "description": "List canvas nodes",
      "input_schema": { "type": "object", "properties": {} }
    }
  ],
  "thinking": {
    "type": "enabled",
    "budget_tokens": 4000
  }
}
```

**Result:** `400 会话内容解析异常`

---

### Working Payload (same endpoint, stripped fields)

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4000,
  "system": [
    {
      "type": "text",
      "text": "You are a helpful assistant."
    }
  ],
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true
}
```

**Result:** `200 OK` with valid SSE stream

---

## Workaround Applied

Client-side detection strips unsupported fields when hitting vibecd:

```typescript
const isVibecd = baseUrl.includes('vibecd.cc') || 
                 baseUrl.includes('localhost:13151') || 
                 baseUrl.includes('127.0.0.1:13151');

const payload = {
  model: resolvedModel,
  max_tokens: maxOutput,
  system: systemBlocks, // no cache_control if isVibecd
  messages: apiMessages,
  stream: true,
  ...(isVibecd ? {} : { tools: toolsArr }),
  ...(isVibecd ? {} : { thinking: thinkingConfig }),
};
```

---

## Questions for vibecd Dev Team

1. **Is tools support planned?** Many Claude API clients rely on function calling.
2. **Is thinking support planned?** Extended thinking is a key Opus 4.7 feature.
3. **Is prompt caching supported?** `cache_control` markers reduce costs significantly for long system prompts.
4. **Should unknown fields be ignored instead of rejected?** Standard practice for API proxies is to pass through or silently drop unknown fields rather than returning 400.

---

## Request

Could vibecd either:
- **Option A:** Support `tools`, `thinking`, and `cache_control` by passing them through to upstream Anthropic API
- **Option B:** Silently ignore unknown fields instead of rejecting the entire request
- **Option C:** Document which fields are supported vs. unsupported in vibecd API docs

This would allow clients to use vibecd as a drop-in replacement for `api.anthropic.com` without compatibility detection logic.

---

## Environment

- **Client:** Next.js 15 app with Anthropic Messages API integration
- **Proxy:** vibe-claude.bat on Windows 11, port 13151
- **Upstream:** vibecd.cc with `service_tier=priority`
- **Token:** Valid Anthropic API key loaded from `.token` file
- **Models tested:** claude-sonnet-4-6, claude-opus-4-7

---

## Contact

For questions or follow-up, reply to this report or contact via GitHub issues.

**Thank you for maintaining vibecd!**
