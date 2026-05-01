/**
 * Provider Factory
 * Creates and manages image generation providers
 */

import type { ImageProvider, ProviderType, ProviderFactory as IProviderFactory } from './types';
import { GeminiProvider, getGeminiProvider } from './gemini';
import { OpenAIProvider, getOpenAIProvider } from './openai';

class ProviderFactoryImpl implements IProviderFactory {
  private providers: Map<ProviderType, ImageProvider> = new Map();

  createProvider(type: ProviderType): ImageProvider {
    // Return cached instance if exists
    if (this.providers.has(type)) {
      return this.providers.get(type)!;
    }

    // Create new instance
    let provider: ImageProvider;

    switch (type) {
      case 'gemini':
        provider = getGeminiProvider();
        break;
      case 'openai':
        provider = getOpenAIProvider();
        break;
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }

    this.providers.set(type, provider);
    return provider;
  }

  getAvailableProviders(): ProviderType[] {
    const available: ProviderType[] = [];

    // Check Gemini
    if (process.env.GEMINI_API_KEY) {
      available.push('gemini');
    }

    // Check OpenAI
    if (process.env.OPENAI_API_KEY) {
      available.push('openai');
    }

    return available;
  }

  isProviderAvailable(type: ProviderType): boolean {
    switch (type) {
      case 'gemini':
        return !!process.env.GEMINI_API_KEY;
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      default:
        return false;
    }
  }

  clearCache(): void {
    this.providers.clear();
  }
}

// Export singleton factory
export const ProviderFactory = new ProviderFactoryImpl();

// Convenience exports
export { GeminiProvider, OpenAIProvider };
export * from './types';
