/**
 * Gemini Provider Implementation
 * Wraps existing Gemini logic into provider interface
 */

import { GoogleGenAI } from '@google/genai';
import type {
  ImageProvider,
  GenerateParams,
  EditParams,
  GeneratedImage,
  GeminiSettings,
  ProviderSettings,
} from './types';
import {
  AuthenticationError,
  RateLimitError,
  ProviderError,
} from './types';

export class GeminiProvider implements ImageProvider {
  readonly name = 'gemini' as const;
  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.client = new GoogleGenAI({ apiKey: key });
  }

  async generate(params: GenerateParams): Promise<GeneratedImage[]> {
    const settings = params.settings as GeminiSettings;

    if (!this.validateSettings(settings)) {
      throw new Error('Invalid Gemini settings');
    }

    try {
      // Build contents array
      const parts: any[] = [{ text: params.prompt }];

      // Add reference images if provided
      if (params.referenceImages && params.referenceImages.length > 0) {
        for (const imageUrl of params.referenceImages) {
          // Convert image to base64 (implementation from existing code)
          const imageData = await this.toBase64(imageUrl);
          parts.push({
            inlineData: {
              data: imageData.data,
              mimeType: imageData.mimeType,
            },
          });
        }
      }

      const response = await this.client.models.generateContent({
        model: this.resolveModel(settings.model),
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: settings.temperature,
          topP: settings.topP,
          topK: settings.topK,
          candidateCount: 1,
          ...(settings.seed && { seed: settings.seed }),
        },
      } as any);

      // Extract image from response
      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts?.[0]?.inlineData) {
        throw new Error('No image data in Gemini response');
      }

      const imageData = candidate.content.parts[0].inlineData;

      return [{
        url: '', // Will be set after persisting
        base64: imageData.data,
        provider: 'gemini',
        metadata: {
          model: settings.model,
          settings,
          timestamp: Date.now(),
        },
      }];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async edit(params: EditParams): Promise<GeneratedImage[]> {
    // Gemini doesn't have a separate edit endpoint
    // Use generate with reference images
    return this.generate({
      prompt: params.prompt,
      referenceImages: params.sourceImages,
      settings: params.settings,
    });
  }

  validateSettings(settings: ProviderSettings): boolean {
    if (settings.provider !== 'gemini') return false;

    const s = settings as GeminiSettings;

    // Validate temperature (0.0 - 2.0)
    if (s.temperature < 0 || s.temperature > 2) {
      return false;
    }

    // Validate topP (0.0 - 1.0)
    if (s.topP < 0 || s.topP > 1) {
      return false;
    }

    // Validate topK (1 - 100)
    if (s.topK < 1 || s.topK > 100) {
      return false;
    }

    return true;
  }

  getDefaultSettings(): GeminiSettings {
    return {
      provider: 'gemini',
      model: 'gemini-3.1-flash-image-preview',
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      resolution: '1024x1024',
    };
  }

  estimateCost(params: GenerateParams): number {
    // Gemini pricing is per-request, not token-based
    // Rough estimates based on model
    const settings = params.settings as GeminiSettings;

    const costPerRequest = {
      'gemini-3.1-flash-image-preview': 0.05,
      'gemini-3-pro-image-preview': 0.15,
      'gemini-2.5-flash-image': 0.03,
    };

    return costPerRequest[settings.model as keyof typeof costPerRequest] || 0.05;
  }

  private resolveModel(label: string): string {
    const MODEL_MAP: Record<string, string> = {
      'Flash': 'gemini-3.1-flash-image-preview',
      'Pro': 'gemini-3-pro-image-preview',
      'Standard': 'gemini-2.5-flash-image',
    };

    return MODEL_MAP[label] || label;
  }

  private async toBase64(urlOrPath: string): Promise<{ data: string; mimeType: 'image/jpeg' }> {
    // This would use the existing toBase64 implementation from generate/route.ts
    // For now, placeholder
    throw new Error('toBase64 not implemented - copy from existing code');
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('401') || message.includes('unauthorized')) {
        return new AuthenticationError('gemini');
      }

      if (message.includes('503') || message.includes('overloaded')) {
        return new RateLimitError('gemini');
      }

      return new ProviderError(error.message, 'gemini');
    }

    return new ProviderError('Unknown error', 'gemini');
  }
}

// Export singleton instance
let instance: GeminiProvider | null = null;

export function getGeminiProvider(apiKey?: string): GeminiProvider {
  if (!instance) {
    instance = new GeminiProvider(apiKey);
  }
  return instance;
}
