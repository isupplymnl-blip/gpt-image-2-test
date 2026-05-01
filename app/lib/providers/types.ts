/**
 * Provider abstraction types for image generation
 * Supports both Gemini and OpenAI providers
 */

export type ProviderType = 'gemini' | 'openai';

export interface GeneratedImage {
  url: string;
  base64?: string;
  revisedPrompt?: string;
  provider: ProviderType;
  metadata?: {
    model: string;
    settings: ProviderSettings;
    cost?: number;
    timestamp: number;
  };
}

export interface GenerateParams {
  prompt: string;
  referenceImages?: string[];
  settings: ProviderSettings;
}

export interface EditParams {
  prompt: string;
  sourceImages: string[];
  settings: ProviderSettings;
}

// Gemini-specific settings
export interface GeminiSettings {
  provider: 'gemini';
  model: string; // 'Flash', 'Pro', 'Standard'
  temperature: number; // 0.0 - 2.0
  topP: number; // 0.0 - 1.0
  topK: number; // 1 - 100
  seed?: number;
  resolution?: string; // '1024x1024', '1536x1024', etc.
}

// OpenAI-specific settings
export interface OpenAISettings {
  provider: 'openai';
  model: string; // 'gpt-image-2' (latest), 'gpt-image-1'
  quality: 'low' | 'medium' | 'high' | 'auto';
  size: string; // 'auto', '1024x1024', '1536x1024', '1024x1536', '2048x1152', '3840x2160', etc. — gpt-image-2 accepts flexible sizes
  output_format: 'png' | 'jpeg' | 'webp';
  background?: 'opaque' | 'auto'; // gpt-image-2 does not support transparent
  moderation?: 'auto' | 'low';
  n?: number; // 1-10 images
  output_compression?: number; // 0-100, jpeg/webp only
}

export type ProviderSettings = GeminiSettings | OpenAISettings;

// Provider interface
export interface ImageProvider {
  readonly name: ProviderType;

  /**
   * Generate image(s) from text prompt
   */
  generate(params: GenerateParams): Promise<GeneratedImage[]>;

  /**
   * Edit existing image(s) with prompt
   * Optional - not all providers support editing
   */
  edit?(params: EditParams): Promise<GeneratedImage[]>;

  /**
   * Validate settings for this provider
   */
  validateSettings(settings: ProviderSettings): boolean;

  /**
   * Get default settings for this provider
   */
  getDefaultSettings(): ProviderSettings;

  /**
   * Estimate cost for generation
   */
  estimateCost?(params: GenerateParams): number;
}

// Provider factory result
export interface ProviderFactory {
  createProvider(type: ProviderType): ImageProvider;
  getAvailableProviders(): ProviderType[];
  isProviderAvailable(type: ProviderType): boolean;
}

// Error types
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: ProviderType,
    public code?: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends ProviderError {
  constructor(
    provider: ProviderType,
    public retryAfter?: number,
  ) {
    super(`Rate limit exceeded for ${provider}`, provider, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends ProviderError {
  constructor(provider: ProviderType) {
    super(`Authentication failed for ${provider}`, provider, 'AUTH_FAILED', 401);
    this.name = 'AuthenticationError';
  }
}
