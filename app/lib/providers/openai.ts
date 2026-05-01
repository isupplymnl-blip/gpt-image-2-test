/**
 * OpenAI Provider Implementation
 * Handles image generation via OpenAI's GPT-Image-2 API
 */

import OpenAI from 'openai';
import type {
  ImageProvider,
  GenerateParams,
  EditParams,
  GeneratedImage,
  OpenAISettings,
  ProviderSettings,
} from './types';
import {
  AuthenticationError,
  RateLimitError,
  ProviderError,
} from './types';

export class OpenAIProvider implements ImageProvider {
  readonly name = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async generate(params: GenerateParams): Promise<GeneratedImage[]> {
    const settings = params.settings as OpenAISettings;

    if (!this.validateSettings(settings)) {
      throw new Error('Invalid OpenAI settings');
    }

    try {
      // gpt-image-2 supports flexible sizes; normalize display format (× → x)
      const normalizedSize = (settings.size ?? 'auto').replace(/×/g, 'x');

      const requestPayload: any = {
        model: settings.model || 'gpt-image-2',
        prompt: params.prompt,
        size: normalizedSize,
        quality: settings.quality === 'auto' ? 'medium' : settings.quality,
        background: settings.background ?? 'auto',
        moderation: settings.moderation ?? 'auto',
        n: settings.n || 1,
        output_format: settings.output_format ?? 'png',
        ...(settings.output_compression !== undefined && ['jpeg', 'webp'].includes(settings.output_format ?? 'png')
          ? { output_compression: settings.output_compression }
          : {}),
      };

      console.log('[openai] ── REQUEST TO OpenAI images.generate ──');
      console.log('[openai] endpoint: POST https://api.openai.com/v1/images/generations');
      console.log('[openai] model:', requestPayload.model);
      console.log('[openai] thinking:', requestPayload.thinking ?? 'off (omitted)');
      console.log('[openai] payload:', JSON.stringify({ ...requestPayload, prompt: `<${params.prompt.length} chars>` }, null, 2));

      const t0 = Date.now();
      const { data: response, response: rawResponse } = await this.client.images
        .generate(requestPayload)
        .withResponse();
      this.logResponse('openai', rawResponse, response, Date.now() - t0);

      if (!response.data) {
        throw new Error('No data in OpenAI response');
      }

      return response.data.map((item, index) => ({
        url: '', // Will be set after persisting
        base64: item.b64_json,
        revisedPrompt: item.revised_prompt,
        provider: 'openai',
        metadata: {
          model: settings.model,
          settings,
          timestamp: Date.now(),
        },
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async edit(params: EditParams): Promise<GeneratedImage[]> {
    const settings = params.settings as OpenAISettings;

    if (!this.validateSettings(settings)) {
      throw new Error('Invalid OpenAI settings');
    }

    if (params.sourceImages.length === 0) {
      throw new Error('At least one source image is required for editing');
    }

    try {
      const enhancedPrompt = `${params.prompt}\n\nReference images provided for context.`;
      const normalizedSize = (settings.size ?? 'auto').replace(/×/g, 'x');

      const requestPayload: any = {
        model: settings.model || 'gpt-image-2',
        prompt: enhancedPrompt,
        size: normalizedSize,
        quality: settings.quality === 'auto' ? 'high' : settings.quality,
        background: settings.background ?? 'auto',
        moderation: settings.moderation ?? 'auto',
        n: 1,
        output_format: settings.output_format ?? 'png',
      };

      console.log('[openai] ── REQUEST TO OpenAI images.generate (edit) ──');
      console.log('[openai] endpoint: POST https://api.openai.com/v1/images/generations');
      console.log('[openai] model:', requestPayload.model);
      console.log('[openai] thinking:', requestPayload.thinking ?? 'off (omitted)');
      console.log('[openai] payload:', JSON.stringify({ ...requestPayload, prompt: `<${enhancedPrompt.length} chars>` }, null, 2));

      const t0 = Date.now();
      const { data: response, response: rawResponse } = await this.client.images
        .generate(requestPayload)
        .withResponse();
      this.logResponse('openai-edit', rawResponse, response, Date.now() - t0);

      if (!response.data) {
        throw new Error('No data in OpenAI response');
      }

      return response.data.map((item) => ({
        url: '',
        base64: item.b64_json,
        revisedPrompt: item.revised_prompt,
        provider: 'openai',
        metadata: {
          model: settings.model,
          settings,
          timestamp: Date.now(),
        },
      }));
    } catch (error) {
      throw this.handleError(error);
    }
  }

  validateSettings(settings: ProviderSettings): boolean {
    if (settings.provider !== 'openai') return false;

    const s = settings as OpenAISettings;

    if (!['low', 'medium', 'high', 'auto'].includes(s.quality)) return false;
    if (!['png', 'jpeg', 'webp'].includes(s.output_format)) return false;
    if (s.n && (s.n < 1 || s.n > 10)) return false;
    if (s.background && !['opaque', 'auto'].includes(s.background)) return false;
    if (s.moderation && !['auto', 'low'].includes(s.moderation)) return false;
    if (s.output_compression !== undefined && (s.output_compression < 0 || s.output_compression > 100)) return false;

    return true;
  }

  getDefaultSettings(): OpenAISettings {
    return {
      provider: 'openai',
      model: 'gpt-image-2',
      quality: 'medium',
      size: 'auto',
      output_format: 'png',
      background: 'auto',
      moderation: 'auto',
      n: 1,
    };
  }

  estimateCost(params: GenerateParams): number {
    const settings = params.settings as OpenAISettings;
    const n = settings.n || 1;

    // Cost estimates per image at 1024x1024
    const costPerImage = {
      low: 0.006,
      medium: 0.053,
      high: 0.211,
      auto: 0.053, // Default to medium
    };

    const baseCost = costPerImage[settings.quality] * n;

    // Adjust for size (rough estimate)
    if (settings.size === '2560x1440') {
      return baseCost * 2.5; // 2K is ~2.5x more expensive
    }
    if (settings.size === '1536x1024' || settings.size === '1024x1536') {
      return baseCost * 1.5; // Larger sizes cost more
    }

    return baseCost;
  }

  private logResponse(tag: string, rawResponse: Response, body: any, elapsedMs: number) {
    const headers: Record<string, string> = {};
    const interesting = [
      'x-request-id', 'openai-version', 'openai-model', 'openai-organization',
      'openai-processing-ms',
      'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
      'x-ratelimit-limit-images', 'x-ratelimit-remaining-images',
      'x-ratelimit-reset-images',
    ];
    for (const h of interesting) {
      const v = rawResponse.headers.get(h);
      if (v) headers[h] = v;
    }

    const summarized = {
      created: body?.created,
      usage: body?.usage,
      data: Array.isArray(body?.data)
        ? body.data.map((item: any) => {
            const { b64_json, ...rest } = item ?? {};
            return {
              ...rest,
              b64_json_bytes: b64_json ? Buffer.byteLength(b64_json, 'base64') : 0,
            };
          })
        : body?.data,
    };

    console.log(`[${tag}] ── RESPONSE FROM OpenAI (${rawResponse.status} ${rawResponse.statusText}, ${elapsedMs}ms) ──`);
    console.log(`[${tag}] headers:`, JSON.stringify(headers, null, 2));
    console.log(`[${tag}] body:`, JSON.stringify(summarized, null, 2));
  }

  private handleError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      const { status, message, code } = error;

      if (status === 401 || status === 403) {
        return new AuthenticationError('openai');
      }

      if (status === 429) {
        const retryAfter = error.headers?.['retry-after'];
        return new RateLimitError(
          'openai',
          retryAfter ? parseInt(retryAfter, 10) : undefined
        );
      }

      return new ProviderError(
        message || 'OpenAI API error',
        'openai',
        code || undefined,
        status
      );
    }

    if (error instanceof Error) {
      return new ProviderError(error.message, 'openai');
    }

    return new ProviderError('Unknown error', 'openai');
  }
}

// Export singleton instance
let instance: OpenAIProvider | null = null;

export function getOpenAIProvider(apiKey?: string): OpenAIProvider {
  if (!instance) {
    instance = new OpenAIProvider(apiKey);
  }
  return instance;
}
