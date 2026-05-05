export type NormalizedRole = 'user' | 'assistant';

export interface NormalizedImage {
  kind: 'product' | 'style' | 'model' | 'file';
  name: string;
  mime: string;
  data: string;
  url?: string;
}

export interface NormalizedToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface NormalizedToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface NormalizedMessage {
  id: string;
  role: NormalizedRole;
  content: string;
  images?: NormalizedImage[];
  toolUses?: NormalizedToolUse[];
  toolResults?: NormalizedToolResult[];
}

// ── Normalized event stream ──────────────────────────────────────────────────
//
// thinking_start / thinking_end are the authoritative on/off signals for the
// heartbeat timer. The client must start the timer on thinking_start and stop
// it on thinking_end — not on thinking_status count. thinking_status events
// carry elapsed/char progress between those two bookends.

export type NormalizedEvent =
  | { type: 'text';             delta: string }
  | { type: 'tool_use';         id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking_start' }
  | { type: 'thinking_end' }
  | { type: 'thinking_status';  elapsedMs: number; chars: number }
  | { type: 'usage';            inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number }
  | { type: 'done';             stopReason: string }
  | { type: 'error';            message: string; retryable: boolean }
  | { type: 'degraded';         feature: string; reason: string };

// ── Tool schema ──────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

// ── Request config ───────────────────────────────────────────────────────────

export interface RequestConfig {
  systemPrompt: string;
  /** Dynamic context appended as a second system block WITHOUT cache_control (canvas state, refs, brief). */
  systemPromptDynamic?: string;
  tools?: ToolDefinition[];
  maxOutputTokens?: number;
  thinking?: { enabled: boolean; budgetTokens: number };
  /** If provided, adapter uses this model exactly and skips internal selectModel(). */
  model?: string;
  signal?: AbortSignal;
}

// ── Adapter interface ────────────────────────────────────────────────────────

export type LLMAdapterId = 'anthropic' | 'vibecd' | 'priority-claude' | 'openai-llm' | 'gemini-llm';

export interface LLMAdapter {
  readonly id: LLMAdapterId;
  readonly displayName: string;
  readonly supportsStreaming: boolean;
  readonly supportsTools: boolean;
  readonly supportsVision: boolean;
  readonly supportsThinking: boolean;
  readonly supportsPromptCaching: boolean;

  sendMessage(
    messages: NormalizedMessage[],
    config: RequestConfig,
  ): AsyncIterable<NormalizedEvent>;
}
