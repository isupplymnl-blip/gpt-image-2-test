# Nano Banana API Reference

## Models

| Model Name | API String | Best For |
|---|---|---|
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | Speed, high-volume, dev use |
| Nano Banana Pro | `gemini-3-pro-image-preview` | Professional production, complex text-in-image, reasoning |
| Nano Banana (base) | `gemini-2.5-flash-image` | Lightweight, fast, low-latency |

**Default recommendation:** Use `gemini-3.1-flash-image-preview` for commercial product + model shots.
Use `gemini-3-pro-image-preview` when text appears in the image or when scene complexity is very high.

---

## Core API Parameters

### Generation Config

```javascript
const config = {
  responseModalities: ["TEXT", "IMAGE"],  // ALWAYS include both
  temperature: 1.0,     // 0.0–2.0. Lower = more literal/accurate. Higher = more creative/varied.
  topP: 0.97,           // 0.0–1.0. Nucleus sampling. 0.95–0.99 for cinematic variety.
  topK: 40,             // 1–100. Vocabulary breadth. Higher = more diverse word/concept selection.
  candidateCount: 2,    // 1–4. Number of image variants to generate.
  seed: 42,             // Integer. Sets deterministic output. Same seed = same image. 
                        // Vary seed to explore close variations.
  maxOutputTokens: 1000
};
```

### Parameter Tuning Guide

| Goal | temperature | top_p | top_k | seed |
|---|---|---|---|---|
| Exact product accuracy | 0.3–0.5 | 0.90 | 20–30 | Fixed (e.g., 42) |
| Lifestyle/editorial | 0.9–1.1 | 0.97 | 40 | Fixed, then vary ±5 |
| Maximum creativity | 1.2–1.5 | 0.99 | 60–80 | Try multiple seeds |
| Consistent series | 0.7 | 0.93 | 32 | Same seed across all |
| Subtle variation series | 0.8 | 0.95 | 40 | Seed+1, Seed+2, Seed+3 |

---

## Tools

### Google Search Grounding
```javascript
tools: [{ googleSearch: {} }]
```
Use when: real-world weather, current events, location accuracy, trend-aware styling.

### Image Search (via Google Search)
Enabled through the same `googleSearch` tool — the model uses image search when prompted correctly.
Trigger in prompt with: "Use image search to find accurate reference for [X]..."

---

## REST API Call (Full Example)

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "YOUR_MASTER_PROMPT_HERE"}]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "temperature": 1.0,
      "topP": 0.97,
      "topK": 40,
      "candidateCount": 2,
      "seed": 42
    }
  }'
```

---

## JavaScript SDK Full Example

```javascript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

async function generateNanoBananaImage(prompt, config = {}) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const generationConfig = {
    responseModalities: ["TEXT", "IMAGE"],
    temperature: config.temperature ?? 1.0,
    topP: config.topP ?? 0.97,
    topK: config.topK ?? 40,
    candidateCount: config.candidateCount ?? 2,
    seed: config.seed ?? 42,
  };

  const response = await ai.models.generateContent({
    model: config.model ?? "gemini-3.1-flash-image-preview",
    contents: prompt,
    generationConfig,
    tools: config.tools ?? [],
  });

  const results = [];
  for (const part of response.candidates[0].content.parts) {
    if (part.text) {
      results.push({ type: "text", content: part.text });
    } else if (part.inlineData) {
      const filename = `output_seed${config.seed ?? 42}_${Date.now()}.png`;
      const buffer = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync(filename, buffer);
      results.push({ type: "image", filename });
    }
  }
  return results;
}

// --- Usage ---
const masterPrompt = "YOUR_MASTER_PROMPT_HERE";

// Generate 2 candidates with seed 42
await generateNanoBananaImage(masterPrompt, {
  model: "gemini-3.1-flash-image-preview",
  temperature: 1.0,
  topP: 0.97,
  topK: 40,
  candidateCount: 2,
  seed: 42,
});

// Explore seed variants
for (const seed of [42, 43, 44, 49, 55]) {
  await generateNanoBananaImage(masterPrompt, { seed, temperature: 1.0, topP: 0.97 });
}
```

---

## Python SDK Full Example

```python
from google import genai
from google.genai import types
import os

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

def generate_nano_banana_image(prompt: str, config: dict = {}):
    generation_config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        temperature=config.get("temperature", 1.0),
        top_p=config.get("top_p", 0.97),
        top_k=config.get("top_k", 40),
        candidate_count=config.get("candidate_count", 2),
        seed=config.get("seed", 42),
    )

    response = client.models.generate_content(
        model=config.get("model", "gemini-3.1-flash-image-preview"),
        contents=[prompt],
        config=generation_config,
    )

    for i, part in enumerate(response.parts):
        if part.text:
            print(part.text)
        elif part.inline_data:
            filename = f"output_seed{config.get('seed', 42)}_{i}.png"
            image = part.as_image()
            image.save(filename)
            print(f"Saved: {filename}")

# Usage
master_prompt = "YOUR_MASTER_PROMPT_HERE"

generate_nano_banana_image(master_prompt, {
    "temperature": 1.0,
    "top_p": 0.97,
    "top_k": 40,
    "seed": 42,
    "candidate_count": 2,
})

# Seed exploration
for seed in [42, 43, 44, 49, 55]:
    generate_nano_banana_image(master_prompt, {"seed": seed})
```

---

## Multi-turn (Iterative Editing) Example

```python
from google.genai import types

chat = client.chats.create(
    model="gemini-3.1-flash-image-preview",
    config=types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        temperature=1.0,
        top_p=0.97,
        seed=42,
    )
)

# Turn 1: Generate initial scene
response1 = chat.send_message("YOUR_MASTER_PROMPT_HERE")

# Turn 2: Refine
response2 = chat.send_message("Make the lighting more golden and warm. The model should smile more naturally.")

# Turn 3: Product emphasis
response3 = chat.send_message("Bring the product bottle 20% larger in frame. Make the label clearer.")
```

---

## Image Input (Product Reference Upload)

```javascript
const productImagePath = "path/to/product.png";
const productImageData = fs.readFileSync(productImagePath).toString("base64");

const prompt = [
  { text: "Use this product image as the exact reference. Place it in the scene described. Match the label, bottle shape, and colors exactly." },
  {
    inlineData: {
      mimeType: "image/png",
      data: productImageData,
    },
  },
  { text: masterPrompt }
];
```

---

## Seed Exploration Table Template

| Seed | Description | Best for |
|---|---|---|
| 42 | Base / anchor | First reference shot |
| 43 | Slight shift | Minor pose/expression variation |
| 44 | Adjacent | Hair/wind movement |
| 49 | Medium variation | Background depth shift |
| 55 | Moderate change | Lighting angle change |
| 77 | Strong variation | Different overall composition |
| 100 | Full exploration | Alternative interpretation |

---

## Response Modality Notes

- Always set `responseModalities: ["TEXT", "IMAGE"]`
- The model returns both a text description AND the image inline data
- Parse both: text gives you what the model interpreted, image is the output
- If you only want the image, you can ignore the text part but always request both

---

# OpenAI gpt-image-2 API Reference

**IMPORTANT: When the active provider is `openai`, use these parameters instead of Gemini parameters. OpenAI does NOT support temperature, topP, topK, or seed.**

## Models

| Model Name | API String | Best For |
|---|---|---|
| GPT-Image-2 | `gpt-image-2` | High-resolution, precise control, fast iteration |
| GPT-Image-1 | `gpt-image-1` | Legacy, lower cost |

**Default recommendation:** Always use `gpt-image-2`.

---

## Core API Parameters

```javascript
const params = {
  model: "gpt-image-2",
  quality: "high",        // "low" | "medium" | "high"
  size: "1024x1024",      // see size table below
  output_format: "png",   // "png" | "jpeg" | "webp"
  background: "auto",     // "auto" | "opaque"
  moderation: "auto",     // "auto" | "low"
  n: 1,                   // 1–10 images per request
  output_compression: 85, // 0–100, jpeg/webp only
};
```

**No temperature, topP, topK, or seed** — OpenAI does not expose these for image generation.

---

## Quality Guide

| Quality | Cost/image | Best For |
|---|---|---|
| `low` | ~$0.006 | Rapid prototyping, drafts |
| `medium` | ~$0.053 | Iterations, client previews |
| `high` | ~$0.211 | Final deliverables, production |

---

## Size Options

| Size | Aspect Ratio | Best For |
|---|---|---|
| `auto` | Model-chosen | Let model decide |
| `1024x1024` | 1:1 | IG Feed, product square |
| `1024x1536` | 2:3 | IG Story portrait |
| `1536x1024` | 3:2 | Landscape, web hero |
| `2048x2048` | 1:1 | High-res square |
| `2560x1440` | 16:9 | Wide banner, cinematic |

---

## API Tag Format

When workflow mode is `isupply` with OpenAI provider, prepend prompts with:
```
[API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]
```

Full example with all params:
```
[API:openai,model=gpt-image-2,quality=high,size=1024x1536,format=png,bg=auto,n=1]
```

---

## Parameter Tuning Guide

| Goal | quality | size | background | output_format |
|---|---|---|---|---|
| Product hero shot | high | 1024x1024 | opaque | png |
| Lifestyle scene | high | 1536x1024 | auto | jpeg |
| IG Story carousel | medium → high | 1024x1536 | auto | png |
| TikTok vertical | high | 1024x1536 | auto | jpeg |
| Web banner | high | 2560x1440 | auto | webp |
| Draft/iteration | low | 1024x1024 | auto | jpeg |

---

## JavaScript SDK Example

```javascript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.images.generate({
  model: 'gpt-image-2',
  prompt: 'YOUR_MASTER_PROMPT_HERE',
  quality: 'high',
  size: '1024x1024',
  output_format: 'png',
  background: 'auto',
  moderation: 'auto',
  n: 1,
});

const imageData = response.data[0].b64_json; // base64 PNG
```

---

## Multi-Variation Strategy (OpenAI)

Since OpenAI has no seed control, use these strategies for consistency across slides:
- Use `n: 2–4` in a single call to get variations, then pick the best
- Keep the subject description identical across carousel prompts — only change angle/setting
- Use high specificity in model/product description (exact colors, materials, dimensions)
- Reference uploaded product images for visual anchoring
