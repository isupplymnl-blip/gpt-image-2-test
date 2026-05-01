/**
 * OpenAI Image Generation API Route
 * Handles GPT-Image-2 generation requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGeneratedDir, makeGeneratedUrl, urlToFilePath } from '../../lib/storage';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/png' }> {
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
    .png()
    .toBuffer();

  return { data: outputBuf.toString('base64'), mimeType: 'image/png' };
}

async function toImageBuffer(urlOrPath: string): Promise<Buffer> {
  let inputBuf: Buffer;
  if (urlOrPath.startsWith('/')) {
    inputBuf = await readFile(urlToFilePath(urlOrPath));
  } else {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status} ${urlOrPath}`);
    inputBuf = Buffer.from(await res.arrayBuffer());
  }
  return await sharp(inputBuf)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, settings, referenceImages, referenceUrls } = body;
    // referenceImages may be {url,name}[] objects (new) or string[] (legacy via referenceUrls)
    const rawRefs: Array<{ url: string; name: string } | string> = referenceImages || referenceUrls || [];
    const refs = rawRefs.map(r => (typeof r === 'string' ? r : r.url));
    const refNames = rawRefs.map(r => (typeof r === 'string' ? 'canvas-reference' : r.name));

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    console.log(`[openai] ── SLIDE GENERATION ──`);
    console.log(`[openai] provider: openai`);
    console.log(`[openai] size: ${settings?.size ?? 'auto (default)'}`);
    console.log(`[openai] referenceImages (${refs.length} total):`);
    refs.forEach((url, i) => console.log(`[openai]   [${i}] "${refNames[i]}" → ${url.slice(-30)}`));
    if (refs.length === 0) console.log(`[openai]   (none)`);

    // Convert reference images to base64 data URLs for /v1/images/edits JSON body
    const imageRefs: Array<{ image_url: string }> = [];
    if (refs && Array.isArray(refs)) {
      for (const url of refs) {
        try {
          const { data, mimeType } = await toBase64(url);
          imageRefs.push({ image_url: `data:${mimeType};base64,${data}` });
        } catch (err) {
          console.warn('[OpenAI] Failed to load reference image:', url, err instanceof Error ? err.message : err);
        }
      }
    }

    const useEdits = imageRefs.length > 0;

    // Build role-aware reference directives so the model knows what each attached image is
    let enrichedPrompt = prompt;
    if (imageRefs.length > 0) {
      const lines: string[] = ['REFERENCE IMAGES — follow these exactly, they are not suggestions:'];
      for (const name of refNames) {
        const n = name.toLowerCase();
        const isModel   = n.includes('model') || n.includes('person') || n.includes('talent') || n.includes('subject');
        const isSetting = n.includes('setting') || n.includes('background') || n.includes('environment') || n.includes('scene') || n.includes('location');
        const isProduct = !isModel && !isSetting;
        if (isModel) {
          lines.push(`• Image "${name}" = HUMAN SUBJECT REFERENCE. Match this person's face structure, skin tone, eye shape, hair color/texture, and body type exactly. Do not alter or reinterpret the model's appearance. This is the identity anchor — preserve it precisely.`);
        } else if (isSetting) {
          lines.push(`• Image "${name}" = ENVIRONMENT/SETTING REFERENCE. Recreate this location, lighting direction, color temperature, and atmosphere faithfully. The environment in the output must visually match this reference — same location type, same light quality.`);
        } else {
          lines.push(`• Image "${name}" = PRODUCT REFERENCE. Replicate this product's exact shape, color, material finish, branding, and proportions with zero creative deviation. This is a real commercial product — no stylization, no substitution.`);
        }
      }
      enrichedPrompt = lines.join('\n') + '\n\n' + prompt;
    }

    // gpt-image-2 = latest (released 2026-04-21), successor to gpt-image-1.5
    const model = (settings?.model as string | undefined) ?? 'gpt-image-2';

    // OpenAI-only params (strip Gemini-specific keys)
    const openaiSettings = {
      ...(settings?.size !== undefined ? { size: String(settings.size).replace(/×/g, 'x') } : {}),
      ...(settings?.quality !== undefined ? { quality: settings.quality } : {}),
      ...(settings?.n !== undefined ? { n: settings.n } : {}),
      ...(settings?.background !== undefined ? { background: settings.background } : {}),
      ...(settings?.output_format !== undefined ? { output_format: settings.output_format } : {}),
      ...(settings?.moderation !== undefined ? { moderation: settings.moderation } : {}),
      ...(settings?.output_compression !== undefined ? { output_compression: settings.output_compression } : {}),
      ...(useEdits && model !== 'gpt-image-2' && settings?.input_fidelity !== undefined ? { input_fidelity: settings.input_fidelity } : {}),
    };

    console.log(`[openai] ── REQUEST TO OPENAI API (${useEdits ? 'images/edits' : 'images/generations'}) ──`);
    console.log(`[openai] endpoint: POST https://api.openai.com${useEdits ? '/v1/images/edits' : '/v1/images/generations'}`);
    console.log(`[openai] model: ${model}`);
    console.log(`[openai] settings:`, JSON.stringify(openaiSettings, null, 2));
    console.log(`[openai] parts: [text(${enrichedPrompt.length} chars)${imageRefs.length > 0 ? `, ${imageRefs.length} reference image(s)` : ''}]`);

    const requestBody = useEdits
      ? { model, prompt: enrichedPrompt, images: imageRefs, ...openaiSettings }
      : { model, prompt: enrichedPrompt, ...openaiSettings };

    const endpoint = useEdits ? '/v1/images/edits' : '/v1/images/generations';

    const t0 = Date.now();
    const response = await fetch(`https://api.openai.com${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenAI Error]', response.status, errorText);
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Detailed response logging (strips multi-MB b64_json from output)
    const interestingHeaders = [
      'x-request-id', 'openai-version', 'openai-model', 'openai-organization',
      'openai-processing-ms',
      'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
      'x-ratelimit-limit-images', 'x-ratelimit-remaining-images',
      'x-ratelimit-reset-images',
    ];
    const headers: Record<string, string> = {};
    for (const h of interestingHeaders) {
      const v = response.headers.get(h);
      if (v) headers[h] = v;
    }
    const summarized = {
      ...data,
      data: Array.isArray(data?.data)
        ? data.data.map((item: any) => {
            const { b64_json, ...rest } = item ?? {};
            return { ...rest, b64_json_bytes: b64_json ? Buffer.byteLength(b64_json, 'base64') : 0 };
          })
        : data?.data,
    };
    console.log(`[openai] ── RESPONSE FROM OPENAI (${response.status} ${response.statusText}, ${Date.now() - t0}ms) ──`);
    console.log(`[openai] headers:`, JSON.stringify(headers, null, 2));
    console.log(`[openai] body:`, JSON.stringify(summarized, null, 2));

    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ error: 'No images generated' }, { status: 500 });
    }
    const base64Data = data.data[0].b64_json;

    const generatedDir = getGeneratedDir();
    await mkdir(generatedDir, { recursive: true });
    const timestamp = Date.now();
    const format = settings?.output_format || 'png';
    const filename = `openai-${timestamp}.${format}`;
    const filepath = join(generatedDir, filename);

    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filepath, buffer);

    const imageUrl = makeGeneratedUrl(filename);

    return NextResponse.json({
      success: true,
      imageUrl,
      revisedPrompt: data.data[0].revised_prompt,
      provider: 'openai',
    });

  } catch (error: any) {
    console.error('[OpenAI Generate Error]', error);

    if (error.message?.includes('401') || error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key' },
        { status: 401 }
      );
    }

    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Image generation failed' },
      { status: 500 }
    );
  }
}
