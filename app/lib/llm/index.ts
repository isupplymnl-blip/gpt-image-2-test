import { getAnthropicAdapter } from './AnthropicAdapter';
import { getVibecdAdapter }    from './VibecdAdapter';
import { getPriorityClaudeAdapter } from './PriorityClaudeAdapter';
import type { LLMAdapter, LLMAdapterId } from './types';

export { getAnthropicAdapter } from './AnthropicAdapter';
export { getVibecdAdapter }    from './VibecdAdapter';
export { getPriorityClaudeAdapter } from './PriorityClaudeAdapter';
export type { LLMAdapter, LLMAdapterId, NormalizedMessage, NormalizedEvent, RequestConfig, ToolDefinition } from './types';

const registry: Record<LLMAdapterId, () => LLMAdapter> = {
  'anthropic':      getAnthropicAdapter,
  'vibecd':         getVibecdAdapter,
  'priority-claude': getPriorityClaudeAdapter,
  'openai-llm': () => { throw new Error('OpenAILLMAdapter not yet implemented'); },
  'gemini-llm': () => { throw new Error('GeminiLLMAdapter not yet implemented'); },
};

export function getAdapter(id: LLMAdapterId = 'anthropic'): LLMAdapter {
  const factory = registry[id];
  if (!factory) throw new Error(`Unknown LLM adapter: ${id}`);
  return factory();
}
