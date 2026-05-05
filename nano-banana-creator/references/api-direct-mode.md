# API Direct Mode Formatting

**Workflow mode:** `api-direct`

**Target users:** Developers calling Gemini API directly via JavaScript or Python.

---

## Output Format

### 1. Creative Brief Summary
Standard format (same across all modes).

### 2. Model Block
Standard format (same across all modes).

### 3. Setting Block
Standard format (same across all modes).

### 4. Product Block
Standard format (same across all modes).

### 5. Master Prompt
**Clean prompt text with NO `[API:]` tag.**

Parameters are set in code, not in the prompt string. The `[API:]` tag would break the prompt if passed to the API.

### 6. Ready-to-Run Code (EMPHASIZED)

**JavaScript Example:**
```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateImage() {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-image-preview"
  });

  const prompt = `[MASTER PROMPT TEXT HERE]`;

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [
        // Optional: reference images
        // { inlineData: { mimeType: "image/jpeg", data: base64Image1 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      temperature: 1.0,
      topP: 0.97,
      topK: 40,
      seed: 42,
      candidateCount: 1
    }
  });

  const imageData = result.response.candidates[0].content.parts[0].inlineData;
  // imageData.mimeType = "image/png"
  // imageData.data = base64 encoded image
  
  return imageData;
}
```

**Python Example:**
```python
import google.generativeai as genai
import os

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

model = genai.GenerativeModel("gemini-3.1-flash-image-preview")

prompt = """[MASTER PROMPT TEXT HERE]"""

response = model.generate_content(
    contents=[
        # Optional: reference images
        # {"mime_type": "image/jpeg", "data": base64_image1},
        prompt
    ],
    generation_config={
        "response_modalities": ["IMAGE"],
        "temperature": 1.0,
        "top_p": 0.97,
        "top_k": 40,
        "seed": 42,
        "candidate_count": 1
    }
)

image_data = response.candidates[0].content.parts[0].inline_data
# image_data.mime_type = "image/png"
# image_data.data = base64 encoded image
```

### 7. Reference Image Handling

**When reference images are needed (style replication, character consistency, product reference):**

**JavaScript:**
```javascript
// Load image as base64
const fs = require('fs');
const imageBuffer = fs.readFileSync('path/to/image.jpg');
const base64Image = imageBuffer.toString('base64');

const result = await model.generateContent({
  contents: [{
    role: "user",
    parts: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      { text: "Image 1: reference style — typography hierarchy, layout grid, color palette to match.\n\n" + prompt }
    ]
  }],
  generationConfig: { /* ... */ }
});
```

**Python:**
```python
import base64

# Load image as base64
with open('path/to/image.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')

response = model.generate_content(
    contents=[
        {"mime_type": "image/jpeg", "data": image_data},
        "Image 1: reference style — typography hierarchy, layout grid, color palette to match.\n\n" + prompt
    ],
    generation_config={ /* ... */ }
)
```

### 8. API Configuration Summary

**Model:** `gemini-3.1-flash-image-preview` or `gemini-3-pro-image-preview`

**Parameters:**
- `responseModalities`: `["IMAGE"]`
- `temperature`: 0.7–1.0 (lower for text accuracy, higher for creativity)
- `topP`: 0.93–0.97
- `topK`: 32–40
- `seed`: Fixed integer for consistency
- `candidateCount`: 1 (multiple candidates not recommended for images)

**Optional (Gemini 3 only):**
- `thinking_level`: `"High"` (for complex typography)
- `include_thoughts`: `true`

**Tools (optional):**
- `tools: [{ googleSearch: {} }]` — real-time web search
- `tools: [{ imageSearch: {} }]` — visual context search (3.1 Flash only)

### 9. Seed Exploration Guide
Standard format (same across all modes).

---

## What's Different in API Direct Mode

| Element | API Direct Mode | Other Modes |
|---|---|---|
| **Master Prompt** | No `[API:]` tag | iSupply/generic: includes `[API:]` tag |
| **Ready-to-Run Code** | Emphasized, full examples | iSupply: omitted; ai-studio: minimal |
| **Paste Targets** | None (code-based workflow) | iSupply: explicit node targets |
| **Parameter Location** | In code (`generationConfig`) | iSupply: auto-filled from tag; ai-studio: sidebar |
| **Reference Images** | `inlineData` code examples | iSupply: UploadNode; ai-studio: manual upload |

---

**Last Updated:** 2026-05-05
**Version:** 1.0
