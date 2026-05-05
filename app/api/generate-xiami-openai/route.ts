/**
 * Xiami OpenAI Image Generation API Route
 * OpenAI-compatible proxy with different base URL + key
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
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  return { data: outputBuf.toString('base64'), mimeType: 'image/png' };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, settings, referenceImages, referenceUrls } = body;
    const rawRefs: Array<{ url: string; name: string } | string> = referenceImages || referenceUrls || [];
    const refs = rawRefs.map(r => (typeof r === 'string' ? r : r.url));
    const refNames = rawRefs.map(r => (typeof r === 'string' ? 'canvas-reference' : r.name));

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.XIAMI_OPENAI_API_KEY;
    const baseURL = process.env.XIAMI_OPENAI_BASE_URL || 'https://xiamiapi.xyz';
    if (!apiKey) throw new Error('XIAMI_OPENAI_API_KEY not set');

    console.log(`[xiami-openai] ── SLIDE GENERATION ──`);
    console.log(`[xiami-openai] provider: xiami-openai`);
    console.log(`[xiami-openai] baseURL: ${baseURL}`);
    console.log(`[xiami-openai] size: ${settings?.size ?? 'auto (default)'}`);
    console.log(`[xiami-openai] referenceImages (${refs.length} total):`);
    refs.forEach((url, i) => console.log(`[xiami-openai]   [${i}] "${refNames[i]}" → ${url.slice(-30)}`));
    if (refs.length === 0) console.log(`[xiami-openai]   (none)`);

    const imageRefs: Array<{ image_url: string }> = [];
    if (refs && Array.isArray(refs)) {
      for (const url of refs) {
        try {
          const { data, mimeType } = await toBase64(url);
          imageRefs.push({ image_url: `data:${mimeType};base64,${data}` });
        } catch (err) {
          console.warn('[xiami-openai] Failed to load reference image:', url, err instanceof Error ? err.message : err);
        }
      }
    }

    const useEdits = imageRefs.length > 0;
    const endpointPath = useEdits ? '/v1/images/edits' : '/v1/images/generations';
    console.log(`[xiami-openai] ── ENDPOINT ROUTING DECISION ──`);
    console.log(`[xiami-openai] reference image count: ${imageRefs.length}`);
    console.log(`[xiami-openai] policy: refs=0 → /v1/images/generations | refs≥1 → /v1/images/edits`);
    console.log(`[xiami-openai] → SELECTED: POST ${baseURL}${endpointPath}`);

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

    const model = (settings?.model as string | undefined) ?? 'gpt-image-2';

    const openaiSettings = {
      ...(settings?.size !== undefined ? { size: String(settings.size).replace(/×/g, 'x') } : {}),
      ...(settings?.quality !== undefined ? { quality: settings.quality } : {}),
      ...(settings?.n !== undefined ? { n: settings.n } : {}),
      ...(settings?.background !== undefined ? { background: settings.background } : {}),
      ...(settings?.output_format !== undefined ? { output_format: settings.output_format } : {}),
      ...(settings?.moderation !== undefined ? { moderation: settings.moderation } : {}),
      ...(settings?.output_compression !== undefined ? { output_compression: settings.output_compression } : {}),
    };

    console.log(`[xiami-openai] ── REQUEST TO XIAMI OPENAI API (${useEdits ? 'images/edits' : 'images/generations'}) ──`);
    console.log(`[xiami-openai] endpoint: POST ${baseURL}${useEdits ? '/v1/images/edits' : '/v1/images/generations'}`);
    console.log(`[xiami-openai] model: ${model}`);
    console.log(`[xiami-openai] settings:`, JSON.stringify(openaiSettings, null, 2));
    console.log(`[xiami-openai] parts: [text(${enrichedPrompt.length} chars)${imageRefs.length > 0 ? `, ${imageRefs.length} reference image(s)` : ''}]`);

    const endpoint = useEdits ? '/v1/images/edits' : '/v1/images/generations';
    const t0 = Date.now();
    let response: Response;

    if (useEdits) {
      // Use native FormData (undici) to ensure proper multipart boundary
      const form = new FormData();

      form.append('model', model);
      form.append('prompt', enrichedPrompt);

      // Convert reference images to Blob and append
      for (let i = 0; i < refs.length; i++) {
        const { data: b64data } = await toBase64(refs[i]);
        const buf = Buffer.from(b64data, 'base64');
        const blob = new Blob([buf], { type: 'image/png' });
        form.append('image', blob, `ref-${i}.png`);
      }

      // Append OpenAI settings
      if (openaiSettings.size) form.append('size', openaiSettings.size);
      if (openaiSettings.quality) form.append('quality', openaiSettings.quality);
      if (openaiSettings.n) form.append('n', String(openaiSettings.n));
      if (openaiSettings.background) form.append('background', openaiSettings.background);
      if (openaiSettings.output_format) form.append('output_format', openaiSettings.output_format);
      if (openaiSettings.moderation) form.append('moderation', openaiSettings.moderation);
      if (openaiSettings.output_compression !== undefined) form.append('output_compression', String(openaiSettings.output_compression));

      // Verify Content-Type includes boundary
      const probe = new Request('http://probe', { method: 'POST', body: form });
      const contentType = probe.headers.get('content-type');
      console.log(`[xiami-openai] Content-Type: ${contentType}`);
      if (!contentType?.includes('boundary=')) {
        console.error(`[xiami-openai] WARNING: Content-Type missing boundary!`);
      }

      response = await fetch(`${baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          // Do NOT set Content-Type - let fetch compute it with boundary
        },
        body: form,
      });
    } else {
      // /v1/images/generations accepts JSON
      const requestBody = { model, prompt: enrichedPrompt, response_format: 'b64_json', ...openaiSettings };
      response = await fetch(`${baseURL}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[xiami-openai Error]', response.status, errorText);
      return NextResponse.json(
        { error: `Xiami OpenAI API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

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
    console.log(`[xiami-openai] ── RESPONSE FROM XIAMI OPENAI (${response.status} ${response.statusText}, ${Date.now() - t0}ms) ──`);
    console.log(`[xiami-openai] headers:`, JSON.stringify(headers, null, 2));
    console.log(`[xiami-openai] body:`, JSON.stringify(summarized, null, 2));

    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ error: 'No images generated' }, { status: 500 });
    }
    const base64Data = data.data[0].b64_json;

    const generatedDir = getGeneratedDir();
    await mkdir(generatedDir, { recursive: true });
    const timestamp = Date.now();
    const format = settings?.output_format || 'png';
    const filename = `xiami-openai-${timestamp}.${format}`;
    const filepath = join(generatedDir, filename);

    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filepath, buffer);

    const imageUrl = makeGeneratedUrl(filename);

    return NextResponse.json({
      success: true,
      imageUrl,
      revisedPrompt: data.data[0].revised_prompt,
      provider: 'xiami-openai',
    });

  } catch (error: any) {
    console.error('[xiami-openai Generate Error]', error);

    if (error.message?.includes('401') || error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Invalid Xiami OpenAI API key' },
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
