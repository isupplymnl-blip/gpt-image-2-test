/**
 * Canvas Migration Utilities
 * Handles provider mismatch scenarios when loading canvases
 */

import type { ProviderType } from './providers/types';
import type { NodeSettings } from '../context/StudioContext';

export interface MigrationOption {
  id: 'keep' | 'global' | 'migrate';
  label: string;
  description: string;
}

export const MIGRATION_OPTIONS: MigrationOption[] = [
  {
    id: 'keep',
    label: 'Keep as-is',
    description: 'Load canvas without changes. Nodes keep their original provider settings.',
  },
  {
    id: 'global',
    label: 'Use global provider',
    description: 'Update all nodes to use the current global provider setting.',
  },
  {
    id: 'migrate',
    label: 'Migrate all settings',
    description: 'Convert all node settings to match the new provider (Gemini ↔ OpenAI).',
  },
];

/**
 * Convert Gemini settings to OpenAI format
 */
export function geminiToOpenAI(settings: NodeSettings): NodeSettings {
  const temp = settings.temperature ?? 0.9;

  // Map temperature to quality
  let quality: 'low' | 'medium' | 'high' = 'medium';
  if (temp <= 0.5) quality = 'low';
  else if (temp >= 1.0) quality = 'high';

  // Map resolution
  const geminiRes = settings.imageSize ?? '1K';
  let size: '1024x1024' | '1536x1024' | '1024x1536' | '2560x1440' = '1024x1024';
  if (geminiRes === '2K') size = '1536x1024';
  else if (geminiRes === '4K') size = '2560x1440';

  return {
    ...settings,
    provider: 'openai',
    quality,
    size,
    output_format: 'png',
    background: 'opaque',
    // Remove Gemini-specific fields
    temperature: undefined,
    topP: undefined,
    topK: undefined,
    model: undefined,
    eccoModel: undefined,
  };
}

/**
 * Convert OpenAI settings to Gemini format
 */
export function openAIToGemini(settings: NodeSettings): NodeSettings {
  const quality = settings.quality ?? 'medium';

  // Map quality to temperature
  let temperature = 0.9;
  if (quality === 'low') temperature = 0.6;
  else if (quality === 'high') temperature = 1.2;

  // Map size to resolution
  const openaiSize = settings.size ?? '1024x1024';
  let imageSize: '1K' | '2K' | '4K' = '1K';
  if (openaiSize === '1536x1024' || openaiSize === '1024x1536') imageSize = '2K';
  else if (openaiSize === '2560x1440') imageSize = '4K';

  return {
    ...settings,
    provider: 'gemini',
    model: 'Flash',
    temperature,
    topP: 0.95,
    topK: 40,
    imageSize,
    // Remove OpenAI-specific fields
    quality: undefined,
    size: undefined,
    output_format: undefined,
    background: undefined,
  };
}

/**
 * Apply migration strategy to canvas nodes
 */
export function migrateCanvas(
  nodes: Array<{ id: string; data: { settings?: NodeSettings; provider?: ProviderType } }>,
  strategy: 'keep' | 'global' | 'migrate',
  targetProvider: ProviderType
): Array<{ id: string; data: { settings?: NodeSettings; provider?: ProviderType } }> {
  if (strategy === 'keep') {
    return nodes;
  }

  return nodes.map((node) => {
    const currentProvider = node.data.provider ?? node.data.settings?.provider ?? 'gemini';

    if (strategy === 'global') {
      // Just update provider, keep settings
      return {
        ...node,
        data: {
          ...node.data,
          provider: targetProvider,
          settings: {
            ...node.data.settings,
            provider: targetProvider,
          },
        },
      };
    }

    // strategy === 'migrate'
    if (currentProvider === targetProvider) {
      // Already on target provider
      return node;
    }

    const oldSettings = node.data.settings ?? {};
    const newSettings = currentProvider === 'gemini'
      ? geminiToOpenAI(oldSettings)
      : openAIToGemini(oldSettings);

    return {
      ...node,
      data: {
        ...node.data,
        provider: targetProvider,
        settings: newSettings,
      },
    };
  });
}

/**
 * Detect if canvas has provider mismatch
 */
export function detectProviderMismatch(
  nodes: Array<{ data: { provider?: ProviderType; settings?: NodeSettings } }>,
  globalProvider: ProviderType
): boolean {
  return nodes.some((node) => {
    const nodeProvider = node.data.provider ?? node.data.settings?.provider ?? 'gemini';
    return nodeProvider !== globalProvider;
  });
}
