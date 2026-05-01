/**
 * Settings mapper - Convert between Gemini and OpenAI settings
 */

import type { GeminiSettings, OpenAISettings, ProviderSettings } from './providers/types';

/**
 * Map Gemini temperature to OpenAI quality
 *
 * Gemini temperature ranges:
 * - 0.0 - 0.5: Low creativity (deterministic)
 * - 0.5 - 1.0: Medium creativity (balanced)
 * - 1.0 - 2.0: High creativity (experimental)
 *
 * OpenAI quality levels:
 * - low: Fast, cheap, good for testing
 * - medium: Balanced, production quality
 * - high: Best quality, print-ready
 */
function temperatureToQuality(temperature: number): 'low' | 'medium' | 'high' {
  if (temperature <= 0.5) return 'low';
  if (temperature <= 1.0) return 'medium';
  return 'high';
}

/**
 * Map OpenAI quality to Gemini temperature
 */
function qualityToTemperature(quality: 'low' | 'medium' | 'high' | 'auto'): number {
  switch (quality) {
    case 'low': return 0.3;
    case 'medium': return 0.7;
    case 'high': return 1.2;
    case 'auto': return 0.9;
  }
}

/**
 * Map Gemini resolution to OpenAI size
 */
function resolutionToSize(resolution?: string): OpenAISettings['size'] {
  if (!resolution) return '1024x1024';

  // Gemini uses labels like '1024x1024', '1536x1024', etc.
  // OpenAI uses same format
  if (resolution === '1024x1024' ||
      resolution === '1024x1536' ||
      resolution === '1536x1024') {
    return resolution as OpenAISettings['size'];
  }

  return '1024x1024'; // Default
}

/**
 * Map OpenAI size to Gemini resolution
 */
function sizeToResolution(size: string): string {
  if (size === 'auto') return '1024x1024';
  return size;
}

/**
 * Convert Gemini settings to OpenAI settings
 */
export function geminiToOpenAI(settings: GeminiSettings): OpenAISettings {
  return {
    provider: 'openai',
    model: 'gpt-image-2',
    quality: temperatureToQuality(settings.temperature),
    size: resolutionToSize(settings.resolution),
    output_format: 'png',
    background: 'auto',
    n: 1,
  };
}

/**
 * Convert OpenAI settings to Gemini settings
 */
export function openAIToGemini(settings: OpenAISettings): GeminiSettings {
  return {
    provider: 'gemini',
    model: 'gemini-3.1-flash-image-preview',
    temperature: qualityToTemperature(settings.quality),
    topP: 0.95,
    topK: 40,
    resolution: sizeToResolution(settings.size),
  };
}

/**
 * Convert any provider settings to target provider
 */
export function convertSettings(
  from: ProviderSettings,
  to: 'gemini' | 'openai'
): ProviderSettings {
  if (from.provider === to) {
    return from; // No conversion needed
  }

  if (from.provider === 'gemini' && to === 'openai') {
    return geminiToOpenAI(from);
  }

  if (from.provider === 'openai' && to === 'gemini') {
    return openAIToGemini(from);
  }

  throw new Error(`Cannot convert from ${from.provider} to ${to}`);
}

/**
 * Get default settings for a provider
 */
export function getDefaultSettings(provider: 'gemini' | 'openai'): ProviderSettings {
  if (provider === 'gemini') {
    return {
      provider: 'gemini',
      model: 'gemini-3.1-flash-image-preview',
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      resolution: '1024x1024',
    };
  }

  return {
    provider: 'openai',
    model: 'gpt-image-2',
    quality: 'medium',
    size: '1024x1024',
    output_format: 'png',
    background: 'auto',
    n: 1,
  };
}

/**
 * Validate settings for a provider
 */
export function validateSettings(settings: ProviderSettings): boolean {
  if (settings.provider === 'gemini') {
    return (
      settings.temperature >= 0 && settings.temperature <= 2 &&
      settings.topP >= 0 && settings.topP <= 1 &&
      settings.topK >= 1 && settings.topK <= 100
    );
  }

  if (settings.provider === 'openai') {
    return (
      ['low', 'medium', 'high', 'auto'].includes(settings.quality) &&
      ['png', 'jpeg', 'webp'].includes(settings.output_format) &&
      (!settings.n || (settings.n >= 1 && settings.n <= 8))
    );
  }

  return false;
}
