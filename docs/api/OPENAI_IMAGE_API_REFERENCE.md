# OpenAI Image API Reference

## /v1/images/generations (text-to-image)

**Body (JSON):**
- `prompt` (required): up to 32000 chars for GPT image models
- `model`: `gpt-image-1.5` | `gpt-image-1` | `gpt-image-1-mini` | `dall-e-2` | `dall-e-3`
- `background`: `transparent` | `opaque` | `auto`
- `moderation`: `low` | `auto`
- `n`: 1-10
- `output_compression`: 0-100
- `output_format`: `png` | `jpeg` | `webp`
- `partial_images`: 0-3 (streaming only)
- `quality`: `low` | `medium` | `high` | `auto` (GPT image)
- `size`: `auto` | `1024x1024` | `1536x1024` | `1024x1536`
- `stream`: bool
- `user`: string
- ⚠️ `response_format` NOT supported for GPT image models — always returns base64

**Returns:** `data[0].b64_json`

## /v1/images/edits (with reference images)

Supports up to **16 images** for GPT image models.

### Option A: JSON body (cleaner)
```json
{
  "model": "gpt-image-1.5",
  "prompt": "...",
  "images": [
    { "image_url": "https://example.com/img.png" },
    { "image_url": "data:image/png;base64,..." },
    { "file_id": "file-abc123" }
  ],
  "background": "transparent",
  "input_fidelity": "high",
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
  "output_format": "png"
}
```

### Option B: Multipart form-data
```bash
curl -X POST https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $KEY" \
  -F "model=gpt-image-1.5" \
  -F "image[]=@a.png" \
  -F "image[]=@b.png" \
  -F "prompt=..."
```

**Body params:**
- `images`: array of `{ file_id?, image_url? }` (URL or base64 data URL)
- `prompt`: required
- `model`: `gpt-image-1.5` | `gpt-image-1` | `gpt-image-1-mini` | `chatgpt-image-latest` | `dall-e-2`
- `background`: `transparent` | `opaque` | `auto`
- `input_fidelity`: `high` | `low`
- `mask`: `{ file_id?, image_url? }`
- `moderation`: `low` | `auto`
- `n`: number
- `output_compression`: number
- `output_format`: `png` | `jpeg` | `webp`
- `partial_images`: 0-3
- `quality`: `low` | `medium` | `high` | `auto`
- `size`: `auto` | `1024x1024` | `1536x1024` | `1024x1536`
- `stream`: bool

**Returns:** `data[0].b64_json`

## /v1/images/variations
Only supports `dall-e-2` — not relevant for GPT image work.

## Pudding-specific notes
- Pudding accepts `gpt-image-2` (not in official OpenAI list)
- Pudding error: `model gpt-image-2 is only supported on /v1/images/generations and /v1/images/edits`
- Use same model name on both endpoints

## Decision: use JSON with `images` array
- Simpler than multipart (no Blob/FormData/file boundary)
- Same auth/Content-Type as `/v1/images/generations`
- Reference image as base64 data URL: `data:image/png;base64,<base64>`
- Single code path for both endpoints
