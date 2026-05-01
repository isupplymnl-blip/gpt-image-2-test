# Reference Images: Gemini vs OpenAI Comparison

## Gemini (Nano Banana)

### Limits
| Model | Total Images | Objects | Characters |
|-------|--------------|---------|------------|
| **Gemini 3.1 Flash Image** | 14 | 10 | 4 |
| **Gemini 3 Pro Image** | 14 | 6 | 5 |
| **Gemini 2.5 Flash Image** | 3 (recommended) | - | - |

### How to Pass
```json
{
  "contents": [{
    "parts": [
      {"text": "prompt"},
      {"inline_data": {"mime_type": "image/jpeg", "data": "BASE64_1"}},
      {"inline_data": {"mime_type": "image/jpeg", "data": "BASE64_2"}}
    ]
  }]
}
```

### Current Implementation
- ✅ Supports up to 14 reference images
- ✅ Auto-resizes to 1024px (JPEG quality 85)
- ✅ Includes canvas-connected uploads + tag-matched assets
- ✅ Inline base64 in `parts` array

---

## OpenAI (gpt-image-2)

### Limits
- **No explicit limit documented** on number of reference images
- Max **50MB per image**
- High-fidelity processing (not adjustable)

### How to Pass

**Method 1: Images API (Direct)**
```python
client.images.edit(
    model="gpt-image-2",
    image=[
        open("image1.png", "rb"),
        open("image2.png", "rb"),
    ],
    prompt="your prompt"
)
```

**Method 2: Responses API (Multimodal)**
```json
{
  "model": "gpt-5.5",
  "input": [{
    "role": "user",
    "content": [
      {"type": "input_text", "text": "prompt"},
      {"type": "input_image", "image_url": "data:image/jpeg;base64,BASE64_1"},
      {"type": "input_image", "file_id": "file-abc123"}
    ]
  }],
  "tools": [{"type": "image_generation"}]
}
```

### Current Implementation
- ❌ **NOT IMPLEMENTED** - No reference image support yet
- Uses `/v1/images/generations` endpoint (text-only)
- Need to implement `/v1/responses` endpoint for multimodal input

---

## Key Differences

| Feature | Gemini | OpenAI |
|---------|--------|--------|
| **Max Reference Images** | 14 (Flash), 3 (Standard) | No documented limit |
| **API Endpoint** | Single endpoint | Two endpoints (Images vs Responses) |
| **Input Format** | Inline base64 in parts array | File objects, URLs, or file IDs |
| **Size Limit** | No explicit limit | 50MB per image |
| **Fidelity Control** | Automatic | Always high (not adjustable) |
| **Implementation Status** | ✅ Working | ❌ Not implemented |

---

## Implementation Plan for OpenAI Reference Images

### Option 1: Use Responses API (Recommended)
- Endpoint: `/v1/responses`
- Model: `gpt-5.5` (not `gpt-image-2`)
- Pass images as `input_image` content blocks
- Requires `tools: [{"type": "image_generation"}]`

### Option 2: Use Images API
- Endpoint: `/v1/images/edit`
- Pass file objects directly
- Simpler but less flexible

### Required Changes
1. Update `/api/generate-openai/route.ts` to accept `referenceImages`
2. Convert reference URLs to base64 data URLs
3. Switch from `/v1/images/generations` to `/v1/responses`
4. Update request format to multimodal input structure

---

## Sources
- [Gemini Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [OpenAI gpt-image-2 Model Docs](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI Image Generation Guide](https://developers.openai.com/api/docs/guides/image-generation)
