import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { urlToFilePath } from '@/app/lib/storage';
import type {
  LLMAdapter,
  LLMAdapterId,
  NormalizedMessage,
  NormalizedImage,
  NormalizedEvent,
  RequestConfig,
  ToolDefinition,
} from './types';

/* ============================================================================
 * Anthropic wire types (internal to this adapter)
 * ========================================================================== */

type CacheControl = { type: 'ephemeral' };

type TextBlock     = { type: 'text';       text: string;                                             cache_control?: CacheControl };
type ImageBlock    = { type: 'image';      source: { type: 'base64'; media_type: string; data: string } };
type ToolUseBlock  = { type: 'tool_use';   id: string; name: string; input: Record<string, unknown>; cache_control?: CacheControl };
type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
type ContentBlock  = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface SSEContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block:
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'thinking'; thinking: string };
}
interface SSEContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string }
    | { type: 'thinking_delta'; thinking: string };
}
interface SSEContentBlockStop { type: 'content_block_stop'; index: number }
interface SSEMessageStart {
  type: 'message_start';
  message: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
}
interface SSEMessageDelta {
  type: 'message_delta';
  delta: { stop_reason?: string | null };
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}
interface SSEError { type: 'error'; error?: { message?: string; type?: string } }
type SSEEvent =
  | SSEContentBlockStart | SSEContentBlockDelta | SSEContentBlockStop
  | SSEMessageStart | SSEMessageDelta | SSEError
  | { type: string; [k: string]: unknown };

interface CurrentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  id?: string;
  name?: string;
  partialJson?: string;
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function isRetryableStatus(status: number): boolean {
  return (
    status === 0 || status === 408 || status === 425 || status === 429 ||
    status === 500 || status === 502 || status === 503 || status === 504 ||
    (status >= 520 && status <= 524)
  );
}

function shortenUpstreamError(status: number, body: string): string {
  const b = (body || '').trim();
  if (/<!DOCTYPE|<html/i.test(b)) {
    if (/bad gateway|502/i.test(b))        return 'API busy (502 bad gateway) · upstream host offline';
    if (/gateway time[- ]?out|504/i.test(b)) return 'API busy (504 gateway timeout)';
    if (/503/i.test(b))                    return 'API busy (503 service unavailable)';
    if (/cloudflare/i.test(b))             return `API busy (${status} via Cloudflare)`;
    return `API busy (HTTP ${status})`;
  }
  try {
    const j = JSON.parse(b);
    const msg = j?.error?.message || j?.message;
    if (msg) return `API error (${status}): ${String(msg).slice(0, 300)}`;
  } catch { /* ignore */ }
  if (status === 429)              return 'Rate limited (429) · back off and retry';
  if (status === 401 || status === 403) return `Auth failed (${status}) · check token`;
  if (!status)                     return 'Network error reaching upstream';
  return `API error (${status})`;
}

/* ── Prompt-cache markers ──────────────────────────────────────────────────── */

function markLastBlock(msg: ApiMessage): boolean {
  if (typeof msg.content === 'string') {
    const text = msg.content;
    if (!text) return false;
    const block = { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } };
    msg.content = [block];
    return true;
  }
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    const last = msg.content[msg.content.length - 1] as ContentBlock & { cache_control?: CacheControl };
    if (last.cache_control) return false;
    last.cache_control = { type: 'ephemeral' };
    return true;
  }
  return false;
}

function addRollingCacheMarkers(msgs: ApiMessage[]): number {
  const userIndices: number[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'user') userIndices.push(i);
  }
  let added = 0;
  // Skip the last user message — it has live hydrated images that get STRIPPED in the next turn,
  // changing its content and busting the cache. Mark 2nd-to-last and 3rd-to-last instead:
  // these always have images stripped → stable content → cache hits across turns.
  if (userIndices.length >= 2) if (markLastBlock(msgs[userIndices[userIndices.length - 2]])) added++;
  if (userIndices.length >= 3) if (markLastBlock(msgs[userIndices[userIndices.length - 3]])) added++;
  return added;
}

/* ── Image hint text ─────────────────────────────────────────────────────── */

function imageHintText(kind: NormalizedImage['kind'], name: string): string {
  switch (kind) {
    case 'product':
      return `[PRODUCT REFERENCE: ${name}] This image is auto-saved to Assets — do NOT call save_reference_asset. Run Phase 4B STEP 1 Deep Vision Analysis and STEP 2 narrative breakdown (skip STEP 3 replacement chips unless user explicitly asks to edit the product). Capture: exact product name, shape, proportions, material finish (matte/gloss/brushed/textured), primary/secondary colors with names, EVERY piece of visible text on packaging/label quoted VERBATIM word-for-word with font style (serif/sans/script/display) and color, any logo or emblem, physical dimensions/size cues, lid/cap/closure type, any reflective or transparent elements. When writing downstream Master Prompts: (1) declare this ref as "Image N: ${name} product reference — match shape/color/material/branding exactly" in the prompt body; (2) quote label text verbatim using §2 rules ("no extra text, no duplicate letters, no hallucinated words"); (3) add input_fidelity=high to the [API:...] tag on edit generations — identity-level accuracy required.`;
    case 'style':
      return `[STYLE REFERENCE: ${name}] This image is auto-saved to Assets — do NOT call save_reference_asset. Run full Phase 4B (STEP 1 Deep Vision Analysis → STEP 2 breakdown → STEP 3 element-by-element Keep/Replace/Remove chips → STEP 4 confirmation). Capture EVERY element: models, products, text layers (exact text verbatim + font + size + color + position), background, lighting (direction/quality/temperature), camera angle, color grade, composition, props, UI overlays. When writing downstream Master Prompts: declare this ref as "Image N: ${name} style/mood reference — match lighting, color palette, composition, and atmosphere" in the prompt body.`;
    case 'model':
      return `[MODEL REFERENCE: ${name}] This image is auto-saved to Assets — do NOT call save_reference_asset. Capture model identity: face structure, skin tone (Fitzpatrick type), hair color/texture/length, distinctive features. When writing downstream Master Prompts: declare as "Image N: ${name} model identity reference — preserve face, hair, skin tone, wardrobe exactly".`;
    default:
      return `[REFERENCE: ${name}] Auto-saved to Assets. Declare this ref as "Image N: ${name}" in downstream Master Prompts per §3 multi-reference labeling.`;
  }
}

/* ── Message transform ───────────────────────────────────────────────────── */

function transformMessages(messages: NormalizedMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of messages) {
    const hasImages      = !!(m.images && m.images.length);
    const hasToolUses    = !!(m.toolUses && m.toolUses.length);
    const hasToolResults = !!(m.toolResults && m.toolResults.length);

    if (m.role === 'assistant' && hasToolUses) {
      const blocks: ContentBlock[] = [];
      if (m.content && m.content.trim()) blocks.push({ type: 'text', text: m.content });
      for (const tu of m.toolUses!) {
        blocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input ?? {} });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }

    if (m.role === 'user' && hasToolResults) {
      const blocks: ContentBlock[] = [];
      for (const tr of m.toolResults!) {
        const block: ToolResultBlock = { type: 'tool_result', tool_use_id: tr.tool_use_id, content: tr.content };
        if (tr.is_error) block.is_error = true;
        blocks.push(block);
      }
      if (m.content && m.content.trim()) blocks.push({ type: 'text', text: m.content });
      out.push({ role: 'user', content: blocks });
      continue;
    }

    if (m.role === 'user' && hasImages) {
      const blocks: ContentBlock[] = [];
      for (const img of m.images!) {
        if (img.data && img.data.length > 0) {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } });
          blocks.push({ type: 'text', text: imageHintText(img.kind, img.name) });
        } else if (img.url) {
          blocks.push({
            type: 'text',
            text: `[${img.kind.toUpperCase()} REFERENCE: ${img.name}] Already uploaded and saved to assets (${img.url}). Previously analyzed — use your earlier analysis from this conversation. Do not request re-upload.`,
          });
        }
      }
      if (m.content && m.content.trim()) blocks.push({ type: 'text', text: m.content });
      out.push({ role: 'user', content: blocks });
      continue;
    }

    out.push({ role: m.role, content: m.content ?? '' });
  }
  return out;
}

/* ── Image hydration ─────────────────────────────────────────────────────── */

async function hydrateImages(messages: NormalizedMessage[]): Promise<void> {
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  })();

  for (let i = 0; i < messages.length; i++) {
    if (i === lastUserIdx) continue;
    const m = messages[i];
    if (m.images?.length) {
      console.log(`[anthropic] strip ${m.images.length} images from message ${i}`);
      delete (m as Partial<NormalizedMessage>).images;
    }
  }

  if (lastUserIdx < 0) return;
  const m = messages[lastUserIdx];
  if (!m.images?.length) return;

  await Promise.all(m.images.map(async (img) => {
    if (img.data && img.data.length > 0) {
      const approxBytes = (img.data.length * 3) / 4;
      if (approxBytes > 500_000) {
        try {
          const inBuf = Buffer.from(img.data, 'base64');
          const outBuf = await sharp(inBuf).rotate()
            .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true }).toBuffer();
          console.log(`[anthropic/downscale] ${(inBuf.length/1024).toFixed(0)}KB → ${(outBuf.length/1024).toFixed(0)}KB`);
          img.data = outBuf.toString('base64');
          img.mime  = 'image/jpeg';
        } catch (err) {
          console.warn('[anthropic/downscale] failed:', err instanceof Error ? err.message : err);
        }
      }
      return;
    }
    if (!img.url) return;
    try {
      const filePath = urlToFilePath(img.url);
      const buf = await readFile(filePath);
      try {
        const out = await sharp(buf).rotate()
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        console.log(`[anthropic/hydrate] ${(buf.length/1024).toFixed(0)}KB → ${(out.length/1024).toFixed(0)}KB (${img.url})`);
        img.data = out.toString('base64');
        img.mime  = 'image/jpeg';
      } catch {
        img.data = buf.toString('base64');
        if (!img.mime) img.mime = 'image/png';
      }
    } catch (err) {
      console.warn('[anthropic/hydrate] failed to load image:', img.url, err instanceof Error ? err.message : err);
    }
  }));
}

/* ── Model selection ─────────────────────────────────────────────────────── */

const OPUS   = 'claude-opus-4-7';
const SONNET = 'claude-sonnet-4-6';

interface ThinkingConfig { budget: number; maxOutput: number }

function selectModel(messages: NormalizedMessage[]): string {
  const latest = [...messages].reverse().find(m => m.role === 'user');
  const hasLiveImages = !!(latest?.images?.some(img => img.data && img.data.length > 0));
  return hasLiveImages ? OPUS : SONNET;
}

function selectThinking(messages: NormalizedMessage[]): ThinkingConfig {
  const latest = [...messages].reverse().find(m => m.role === 'user');
  const hasLiveImages = !!(latest?.images?.some(img => img.data && img.data.length > 0));
  const text    = (latest?.content ?? '').trim();
  const lowText = text.toLowerCase();
  const isFormAnswer    = lowText.startsWith('form answers:');
  const isShortTrivial  = text.length > 0 && text.length < 40 && !isFormAnswer;
  const isBareGreeting  = /^(hi|hello|hey|yo|sup|hola|good\s+(morning|afternoon|evening))[\s!.?]*$/i.test(text);
  const isCreativeAsk   =
    /\b(generate|create|make|build|design|draft|write|spec|describe|compose|render|produce|stage|develop|craft)\b/i.test(text) ||
    /\b(master\s*prompt|model\s*block|setting\s*block|product\s*block|carousel|moodboard|brief)\b/i.test(text) ||
    /\b(let'?s\s+(go|create|build|make|design|generate|proceed|run|do))\b/i.test(text) ||
    isFormAnswer;

  if (hasLiveImages)    return { budget: 24000, maxOutput: 6000 };
  if (isCreativeAsk)    return { budget: 12000, maxOutput: 6000 };
  if (isBareGreeting)   return { budget: 0,     maxOutput: 1500 };
  if (isShortTrivial)   return { budget: 1024,  maxOutput: 2000 };
  return                       { budget: 4000,  maxOutput: 4000 };
}

/* ============================================================================
 * AnthropicAdapter
 * ========================================================================== */

export class AnthropicAdapter implements LLMAdapter {
  readonly id: LLMAdapterId = 'anthropic';
  readonly displayName: string                = 'Anthropic (Claude)';
  readonly supportsStreaming: boolean         = true;
  readonly supportsTools: boolean            = true;
  readonly supportsVision: boolean           = true;
  readonly supportsThinking: boolean         = true;
  readonly supportsPromptCaching: boolean    = true;
  /** Empty = no restriction. Subclasses set this to exclude models from this route. */
  readonly supportedModels: string[]         = [];

  async *sendMessage(
    messages: NormalizedMessage[],
    config: RequestConfig,
  ): AsyncIterable<NormalizedEvent> {
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');

    const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
    if (!token) {
      yield { type: 'error', message: 'Missing ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY', retryable: false };
      return;
    }

    // Hydrate images (resize + base64 — mutates last user message in place)
    await hydrateImages(messages);

    // Build wire messages
    const apiMessages    = transformMessages(messages);
    // Cache placement is skipped when supportsPromptCaching is false (e.g. VibecdAdapter);
    // the proxy layer owns cache markers in that case.
    const rollingMarkers = this.supportsPromptCaching ? addRollingCacheMarkers(apiMessages) : 0;

    // Model + thinking resolution
    const thinking = config.thinking ?? this.resolveThinking(messages);
    const model    = config.model    ?? (process.env.ANTHROPIC_MODEL || selectModel(messages));
    if (this.supportedModels.length > 0 && !this.supportedModels.includes(model)) {
      yield { type: 'error', message: `Model "${model}" not supported on ${this.id} — allowed: ${this.supportedModels.join(', ')}`, retryable: false };
      return;
    }
    const enableThinking = thinking.enabled && thinking.budgetTokens >= 1024;
    const thinkingConfig = enableThinking
      ? this.resolveThinkingConfig(messages, thinking.budgetTokens)
      : { budget: 0, maxOutput: config.maxOutputTokens ?? 4000 };

    // System blocks: static (cached) + optional dynamic (never cached, changes each turn).
    // Splitting prevents canvasSummary/refsSummary growth from busting the static cache key.
    const systemBlocks = this.supportsPromptCaching
      ? [
          { type: 'text' as const, text: config.systemPrompt, cache_control: { type: 'ephemeral' as const } },
          ...(config.systemPromptDynamic
            ? [{ type: 'text' as const, text: config.systemPromptDynamic }]
            : []),
        ]
      : [{ type: 'text' as const, text: config.systemPrompt + (config.systemPromptDynamic ? '\n\n' + config.systemPromptDynamic : '') }];
    const tools = (config.tools ?? []).length > 0
      ? this.tagLastTool(config.tools!)
      : undefined;

    const payloadBody = JSON.stringify({
      model,
      max_tokens: enableThinking
        ? thinkingConfig.budget + thinkingConfig.maxOutput
        : thinkingConfig.maxOutput,
      system: systemBlocks,
      messages: apiMessages,
      stream: true,
      ...(tools ? { tools } : {}),
      ...(enableThinking ? { thinking: { type: 'enabled', budget_tokens: thinkingConfig.budget } } : {}),
    });

    const payloadSize = Buffer.byteLength(payloadBody, 'utf8');
    console.log(`[anthropic] payload ${(payloadSize/1024).toFixed(1)} KB (${apiMessages.length} msgs, model=${model}, thinking=${enableThinking ? thinkingConfig.budget : 0}, cache_markers=${2 + rollingMarkers})`);
    if (payloadSize > 950_000) {
      console.warn(`[anthropic] payload ${(payloadSize/1024).toFixed(1)} KB exceeds typical 1MB proxy limit`);
    }

    // Upstream request
    const upstream = await this.fetchUpstream(baseUrl, token, payloadBody, config.signal);
    if (!upstream) {
      yield { type: 'error', message: 'upstream unavailable', retryable: true };
      return;
    }

    // SSE → NormalizedEvent stream
    yield* this.readSSEStream(upstream.body!, config.signal);
  }

  /* ── Protected helpers (overridable by subclasses like VibecdAdapter) ── */

  protected resolveThinking(messages: NormalizedMessage[]): { enabled: boolean; budgetTokens: number } {
    const cfg = selectThinking(messages);
    return { enabled: cfg.budget >= 1024, budgetTokens: cfg.budget };
  }

  protected resolveThinkingConfig(messages: NormalizedMessage[], budgetOverride?: number): ThinkingConfig {
    const cfg = selectThinking(messages);
    return { budget: budgetOverride ?? cfg.budget, maxOutput: cfg.maxOutput };
  }

  protected tagLastTool(tools: ToolDefinition[]): (ToolDefinition & { cache_control?: CacheControl })[] {
    return tools.map((t, i) =>
      i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t,
    );
  }

  protected async fetchUpstream(
    baseUrl: string,
    token: string,
    payloadBody: string,
    signal?: AbortSignal,
  ): Promise<Response | null> {
    const vibecdToken = process.env.ANTHROPIC_AUTH_TOKEN_VIBECD;
    const isVibecd    = baseUrl.includes('vibecd.cc');
    const useToken    = isVibecd && vibecdToken ? vibecdToken : token;
    const isPclaude   = /\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl) && process.env.USE_PCLAUDE_TOKEN_POOL === '1';

    const headers: Record<string, string> = {
      'content-type':    'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta':  'prompt-caching-2024-07-31',
    };
    if (!isPclaude) {
      headers['x-api-key']    = useToken;
      headers['authorization'] = `Bearer ${useToken}`;
    }

    const abortCtl = new AbortController();
    const onAbort = () => { try { abortCtl.abort(); } catch { /* ignore */ } };
    signal?.addEventListener('abort', onAbort);

    try {
      console.log(`[anthropic] → ${baseUrl}/v1/messages`);
      const r = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST', headers, body: payloadBody, signal: abortCtl.signal,
      });
      console.log(`[anthropic] ← ${r.status} ${r.statusText}`);
      if (r.ok && r.body) return r;

      const txt = await r.text().catch(() => '');
      const msg = shortenUpstreamError(r.status, txt);
      console.error(`[anthropic] upstream error: ${msg}`);
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[anthropic] upstream exception: ${msg}`);
      return null;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  protected async *readSSEStream(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): AsyncIterable<NormalizedEvent> {
    const reader = body.getReader();
    const dec    = new TextDecoder();
    let buf      = '';

    let currentBlock: CurrentBlock | null = null;
    let inputTokens    = 0;
    let outputTokens   = 0;
    let cacheReadTokens  = 0;
    let cacheCreateTokens = 0;
    let stopReason: string | null = null;
    let doneEmitted    = false;
    let sawMessageStart = false;
    let textEmitted    = false;
    let toolEmitted    = false;
    let accumulatedText = '';

    // Thinking heartbeat — emits thinking_status every 2s between thinking_start / thinking_end
    let thinkingChars  = 0;
    let thinkingStartMs = 0;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    // Buffer for yielded events while heartbeat is async
    const pendingEvents: NormalizedEvent[] = [];

    const startHeartbeat = () => {
      thinkingChars   = 0;
      thinkingStartMs = Date.now();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        pendingEvents.push({ type: 'thinking_status', elapsedMs: Date.now() - thinkingStartMs, chars: thinkingChars });
      }, 2000);
    };
    const stopHeartbeat = () => {
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    };

    const handleEvent = (evt: SSEEvent): NormalizedEvent[] => {
      const out: NormalizedEvent[] = [];
      const t = evt.type;

      if (t === 'content_block_start') {
        const e  = evt as SSEContentBlockStart;
        const cb = e.content_block;
        if (cb.type === 'tool_use') {
          currentBlock = { type: 'tool_use', id: cb.id, name: cb.name, partialJson: '' };
        } else if (cb.type === 'thinking') {
          currentBlock = { type: 'thinking' };
          startHeartbeat();
          out.push({ type: 'thinking_start' });
        } else {
          currentBlock = { type: 'text' };
        }
        return out;
      }

      if (t === 'content_block_delta') {
        const e = evt as SSEContentBlockDelta;
        const d = e.delta;
        if (d.type === 'thinking_delta') {
          thinkingChars += (d.thinking?.length ?? 0);
        } else if (d.type === 'text_delta') {
          if (currentBlock?.type !== 'thinking') {
            textEmitted = true;
            accumulatedText += d.text;
            out.push({ type: 'text', delta: d.text });
          }
        } else if (d.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
          currentBlock.partialJson = (currentBlock.partialJson || '') + (d.partial_json || '');
        }
        return out;
      }

      if (t === 'content_block_stop') {
        if (currentBlock?.type === 'thinking') {
          stopHeartbeat();
          out.push({ type: 'thinking_end' });
        }
        if (currentBlock?.type === 'tool_use') {
          let parsed: Record<string, unknown> = {};
          const raw = currentBlock.partialJson || '';
          if (raw.trim()) {
            try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { parsed = {}; }
          }
          out.push({ type: 'tool_use', id: currentBlock.id!, name: currentBlock.name!, input: parsed });
          toolEmitted = true;
        }
        currentBlock = null;
        return out;
      }

      if (t === 'message_start') {
        sawMessageStart = true;
        const e = evt as SSEMessageStart;
        const u = e.message?.usage;
        if (u) {
          if (typeof u.input_tokens  === 'number') inputTokens      = u.input_tokens;
          if (typeof u.output_tokens === 'number') outputTokens     = u.output_tokens;
          if (typeof u.cache_read_input_tokens    === 'number') cacheReadTokens   = u.cache_read_input_tokens;
          if (typeof u.cache_creation_input_tokens === 'number') cacheCreateTokens = u.cache_creation_input_tokens;
          out.push({ type: 'usage', inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens: cacheCreateTokens });
        }
        return out;
      }

      if (t === 'message_delta') {
        const e = evt as SSEMessageDelta;
        if (e.usage) {
          if (typeof e.usage.input_tokens  === 'number') inputTokens      = e.usage.input_tokens;
          if (typeof e.usage.output_tokens === 'number') outputTokens     = e.usage.output_tokens;
          if (typeof e.usage.cache_read_input_tokens    === 'number') cacheReadTokens   = e.usage.cache_read_input_tokens;
          if (typeof e.usage.cache_creation_input_tokens === 'number') cacheCreateTokens = e.usage.cache_creation_input_tokens;
          out.push({ type: 'usage', inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens: cacheCreateTokens });
        }
        if (e.delta?.stop_reason) {
          stopReason = e.delta.stop_reason;
          console.log(`[anthropic] stop_reason: ${stopReason}`);
        }
        return out;
      }

      if (t === 'message_stop') {
        if (!doneEmitted) {
          const totalIn = inputTokens + cacheReadTokens + cacheCreateTokens;
          const hitPct  = totalIn > 0 ? ((cacheReadTokens / totalIn) * 100).toFixed(1) : '0.0';
          console.log(`[anthropic] tokens: in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_create=${cacheCreateTokens} hit=${hitPct}%`);
          if (stopReason === 'end_turn' && accumulatedText.startsWith('[proxy]')) {
            console.warn(`[anthropic] proxy synthetic end_turn detected: "${accumulatedText.slice(0, 120)}"`);
            out.push({ type: 'error', message: accumulatedText, retryable: true });
          } else {
            out.push({ type: 'done', stopReason: stopReason ?? 'end_turn' });
          }
          doneEmitted = true;
        }
        return out;
      }

      if (t === 'error') {
        const e = evt as SSEError;
        out.push({ type: 'error', message: e.error?.message || 'upstream stream error', retryable: false });
        return out;
      }

      return out;
    };

    try {
      let bytesReceived = 0;
      let eventsParsed  = 0;
      while (true) {
        if (signal?.aborted) break;

        // Drain any buffered heartbeat events first
        while (pendingEvents.length > 0) yield pendingEvents.shift()!;

        const { done, value } = await reader.read();
        if (done) {
          console.log(`[anthropic] SSE stream ended (${bytesReceived} bytes, ${eventsParsed} events)`);
          break;
        }
        bytesReceived += value?.length ?? 0;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n');
          let data = '';
          for (const ln of lines) {
            if (ln.startsWith('data: '))     data += ln.slice(6);
            else if (ln.startsWith('data:')) data += ln.slice(5);
          }
          if (!data || data === '[DONE]') continue;
          let evt: SSEEvent;
          try { evt = JSON.parse(data) as SSEEvent; } catch { continue; }
          eventsParsed += 1;
          if (eventsParsed <= 3 || eventsParsed % 50 === 0) console.log(`[anthropic] event #${eventsParsed}: ${evt.type}`);
          for (const e of handleEvent(evt)) yield e;
        }
      }

      // Drain final heartbeat events
      while (pendingEvents.length > 0) yield pendingEvents.shift()!;

      if (!doneEmitted) {
        if (!sawMessageStart && !textEmitted && !toolEmitted) {
          console.warn('[anthropic] stream ended with no content — proxy returned empty stream');
          yield { type: 'error', message: 'upstream returned empty stream (proxy error — check proxy logs)', retryable: true };
        } else {
          yield { type: 'done', stopReason: stopReason ?? 'end_turn' };
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[anthropic] SSE read loop error:', msg);
      if (!signal?.aborted) {
        yield { type: 'error', message: `stream error: ${msg}`, retryable: false };
      }
    } finally {
      stopHeartbeat();
      try { reader.cancel(); } catch { /* ignore */ }
    }
  }
}

/* ── Singleton ─────────────────────────────────────────────────────────────── */

let _instance: AnthropicAdapter | null = null;
export function getAnthropicAdapter(): AnthropicAdapter {
  if (!_instance) _instance = new AnthropicAdapter();
  return _instance;
}
