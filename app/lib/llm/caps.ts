import type { LLMAdapterId } from './types';

export interface AdapterCaps {
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsPromptCaching: boolean;
}

const CAPS: Record<LLMAdapterId, AdapterCaps> = {
  'anthropic': {
    supportsTools: true,
    supportsVision: true,
    supportsThinking: true,
    supportsPromptCaching: true,
  },
  'vibecd': {
    supportsTools: false,
    supportsVision: true,
    supportsThinking: false,
    supportsPromptCaching: false,
  },
  'priority-claude': {
    supportsTools: true,
    supportsVision: true,
    supportsThinking: true,
    supportsPromptCaching: false,
  },
  'openai-llm': {
    supportsTools: false,
    supportsVision: false,
    supportsThinking: false,
    supportsPromptCaching: false,
  },
  'gemini-llm': {
    supportsTools: false,
    supportsVision: false,
    supportsThinking: false,
    supportsPromptCaching: false,
  },
};

const FALLBACK: AdapterCaps = {
  supportsTools: true,
  supportsVision: true,
  supportsThinking: true,
  supportsPromptCaching: true,
};

export function getAdapterCaps(id: LLMAdapterId = 'anthropic'): AdapterCaps {
  return CAPS[id] ?? FALLBACK;
}
