import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { loadSkill } from '@/app/lib/skillLoader';
import type { ProviderType } from '@/app/lib/providers/types';
import { urlToFilePath } from '@/app/lib/storage';
import { resolveLocalUpstream } from '@/app/lib/pclaudeResolver';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* ============================================================================
 * Types
 * ========================================================================== */

interface IncomingImage {
  kind: 'product' | 'style' | 'brand';
  name: string;
  mime: string;
  data: string;
  url?: string; // present when already saved to assets and base64 stripped
}

interface IncomingToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface IncomingToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface IncomingMsg {
  role: 'user' | 'assistant';
  content: string;
  images?: IncomingImage[];
  toolUses?: IncomingToolUse[];
  toolResults?: IncomingToolResult[];
}

interface ClientContext {
  canvasSummary?: string;
  refsSummary?: string;
  brandContext?: string;
  workflowMode?: 'isupply' | 'api-direct' | 'ai-studio' | 'generic';
  skipGates?: string[];
  extraInstruction?: string;
  automationEnabled?: boolean;
  provider?: ProviderType;
  shootBrief?: string; // accumulated Q&A decisions from all phases
}

interface ClientBody {
  model?: string;
  messages: IncomingMsg[];
  clientContext?: ClientContext;
}

type TextBlock = { type: 'text'; text: string };
type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
};
type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/**
 * Tag the last content block of `msg` with `cache_control: ephemeral`.
 * Wraps string content to list form. Returns true if a marker was added.
 */
function markLastBlock(msg: ApiMessage): boolean {
  if (typeof msg.content === 'string') {
    const text = msg.content;
    if (!text) return false;
    const block = { type: 'text', text } as TextBlock & {
      cache_control: { type: 'ephemeral' };
    };
    block.cache_control = { type: 'ephemeral' };
    msg.content = [block];
    return true;
  }
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    const last = msg.content[msg.content.length - 1] as ContentBlock & {
      cache_control?: { type: 'ephemeral' };
    };
    if (last.cache_control) return false;
    last.cache_control = { type: 'ephemeral' };
    return true;
  }
  return false;
}

/**
 * Add rolling prompt-cache breakpoints: mark the last user message (creates a
 * fresh cache entry covering the full transcript through this turn) and the
 * previous user message (hits the cache entry created on the previous turn).
 * With system + last-tool already tagged, this uses the full Anthropic budget
 * of 4 breakpoints. Returns count of markers added.
 */
function addRollingCacheMarkers(msgs: ApiMessage[]): number {
  const userIndices: number[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'user') userIndices.push(i);
  }
  let added = 0;
  if (userIndices.length >= 1) {
    if (markLastBlock(msgs[userIndices[userIndices.length - 1]])) added++;
  }
  if (userIndices.length >= 2) {
    if (markLastBlock(msgs[userIndices[userIndices.length - 2]])) added++;
  }
  return added;
}

/* ----- SSE event shapes from upstream ----- */

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

interface SSEContentBlockStop {
  type: 'content_block_stop';
  index: number;
}

interface SSEMessageStart {
  type: 'message_start';
  message: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

interface SSEMessageDelta {
  type: 'message_delta';
  delta: { stop_reason?: string | null };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface SSEError {
  type: 'error';
  error?: { message?: string; type?: string };
}

type SSEEvent =
  | SSEContentBlockStart
  | SSEContentBlockDelta
  | SSEContentBlockStop
  | SSEMessageStart
  | SSEMessageDelta
  | SSEError
  | { type: string; [k: string]: unknown };

interface CurrentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  id?: string;
  name?: string;
  partialJson?: string;
}

/* ============================================================================
 * Tool definitions (authoritative JSON Schema for Anthropic tools)
 * ========================================================================== */

const TOOLS = [
  {
    name: 'list_canvas',
    description:
      'List all nodes currently on the canvas with their IDs, types, and summaries. Call this to understand what already exists before writing your output.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_uploaded_refs',
    description:
      'List uploaded reference assets (product, style, brand images) available in the current session. Use to decide which references are available for use.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_brand_context',
    description:
      'Read the active brand DNA / brand context document. Skip if LIVE CLIENT CONTEXT already contains the brand block; call only when you need authoritative brand direction before writing a master prompt.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'save_reference_asset',
    description:
      'Register a generated or existing image as a named asset in the Assets library. Use ONLY with imageUrl (a /uploads/... path from a generated node) — NOT for user-uploaded images (those are auto-saved by the client). Provide vision-derived name and tags.',
    input_schema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'URL path of an already-saved image (e.g. /uploads/canvas/abc.png) to register as an asset. Use this for generated images.',
        },
        name: {
          type: 'string',
          description: 'Asset name (e.g., "Pro-2 Earbuds White", "Summer Bikini Collection")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for this asset (e.g., ["earbuds", "white", "stem-style", "charging-case"]).',
        },
      },
      required: ['imageUrl', 'name', 'tags'],
      additionalProperties: false,
    },
  },
];

/* ============================================================================
 * Helpers
 * ========================================================================== */

function isRetryable(status: number): boolean {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (status >= 520 && status <= 524)
  );
}

function shortenUpstreamError(status: number, body: string): string {
  const b = (body || '').trim();
  if (/<!DOCTYPE|<html/i.test(b)) {
    if (/bad gateway|502/i.test(b)) return 'API busy (502 bad gateway) · upstream host offline';
    if (/gateway time[- ]?out|504/i.test(b)) return 'API busy (504 gateway timeout)';
    if (/503/i.test(b)) return 'API busy (503 service unavailable)';
    if (/cloudflare/i.test(b)) return `API busy (${status} via Cloudflare)`;
    return `API busy (HTTP ${status})`;
  }
  try {
    const j = JSON.parse(b);
    const msg = j?.error?.message || j?.message;
    if (msg) return `API error (${status}): ${String(msg).slice(0, 300)}`;
  } catch {
    /* ignore */
  }
  if (status === 429) return 'Rate limited (429) · back off and retry';
  if (status === 401 || status === 403) return `Auth failed (${status}) · check token`;
  if (!status) return 'Network error reaching upstream';
  return `API error (${status})`;
}

function imageHintText(kind: IncomingImage['kind'], name: string): string {
  switch (kind) {
    case 'product':
      return `[PRODUCT REFERENCE: ${name}] Analyze this product image thoroughly — color, material, shape, brand text, key features. This image is being auto-saved to Assets by the client; do NOT call save_reference_asset.`;
    case 'style':
      return `[STYLE REFERENCE: ${name}] Analyze this style/mood reference — lighting, composition, color palette, aesthetic, mood. This image is being auto-saved to Assets by the client; do NOT call save_reference_asset.`;
    case 'brand':
      return `[BRAND REFERENCE: ${name}] This is a brand asset — treat as authoritative for palette, typography cues, logo treatment, and brand voice hints.`;
    default:
      return `[REFERENCE: ${name}]`;
  }
}

function buildSystemPrompt(provider: ProviderType | undefined, ctx?: ClientContext): string {
  const base = loadSkill();

  const lines: string[] = [];
  lines.push('');
  lines.push('');
  lines.push('===== LIVE CLIENT CONTEXT =====');
  lines.push('');
  lines.push(`Workflow mode: ${ctx?.workflowMode ?? 'generic'}`);
  lines.push(`Automation enabled: ${ctx?.automationEnabled ?? false}`);
  lines.push(`Active provider: ${provider ?? 'gemini'}`);
  lines.push('');

  if (provider === 'openai') {
    lines.push('## Active Provider: OpenAI gpt-image-2');
    lines.push('Use these parameters in tool calls and [API:...] tags. Do NOT use temperature, topP, topK, or seed — OpenAI does not support them.');
    lines.push('- model: gpt-image-2');
    lines.push('- quality: low | medium | high  (medium for iterations, high for finals)');
    lines.push('- size: auto | 1024x1024 (1:1) | 1024x1536 (2:3 portrait) | 1536x1024 (3:2 landscape) | 2048x1152 (16:9 widescreen) | 3840x2160 (16:9 4K)');
    lines.push('  ↳ For Phase 6 ratios not in the list above (4:5, 9:16, 3:4, 21:9), use the parenthesized W×H captured in the form value (e.g. aspect_ratio "4:5 (1024x1280)" → size=1024x1280). gpt-image-2 accepts flexible W×H.');
    lines.push('- output_format: png | jpeg | webp');
    lines.push('- background: auto | opaque  (opaque for clean product shots)');
    lines.push('- moderation: auto | low');
    lines.push('- n: 1–10 images');
    lines.push('API tag format: [API:openai,model=gpt-image-2,quality=high,size=1024x1024,format=png]');
    lines.push('  ↳ Match `size=` to the user\'s aspect_ratio choice. Never default to 1024x1024 unless ratio = 1:1.');
  } else {
    lines.push('## Active Provider: Google Gemini (Nano Banana)');
    lines.push('Use these parameters in tool calls and [API:...] tags.');
    lines.push('- model: gemini-3.1-flash-image-preview | gemini-3-pro-image-preview | gemini-2.5-flash-image');
    lines.push('- temperature: 0.0–2.0 (default 0.9)');
    lines.push('- topP: 0.0–1.0 (default 0.95)');
    lines.push('- topK: 1–100 (default 40)');
    lines.push('- seed: integer (for consistency across slides)');
    lines.push('- ratio: 1:1 | 4:5 | 9:16 | 16:9 | 3:4 | 21:9  (Gemini has no native size param — ratio drives aspect)');
    lines.push('API tag format: [API:gemini,model=Flash,temp=0.9,topP=0.95,topK=40,seed=12345,ratio=1:1]');
    lines.push('  ↳ Always include `ratio=` matching the user\'s aspect_ratio choice from Phase 6.');
  }

  if (ctx?.skipGates && ctx.skipGates.length) {
    lines.push('');
    lines.push(`Skip gates: ${ctx.skipGates.join(', ')}`);
  }
  if (ctx?.extraInstruction && ctx.extraInstruction.trim()) {
    lines.push(ctx.extraInstruction.trim());
  }
  if (ctx?.canvasSummary && ctx.canvasSummary.trim()) {
    lines.push('');
    lines.push('## Canvas State');
    lines.push(ctx.canvasSummary.trim());
  }
  if (ctx?.refsSummary && ctx.refsSummary.trim()) {
    lines.push('');
    lines.push('## Uploaded References');
    lines.push(ctx.refsSummary.trim());
  }
  if (ctx?.brandContext && ctx.brandContext.trim()) {
    lines.push('');
    lines.push('## Brand Context');
    lines.push(ctx.brandContext.trim());
  }
  if (ctx?.shootBrief && ctx.shootBrief.trim()) {
    lines.push('');
    lines.push('## Shoot Brief (all Q&A decisions captured so far)');
    lines.push(ctx.shootBrief.trim());
    lines.push('Do NOT re-ask about any decision already captured here. Restate it back instead.');
  }
  return base + lines.join('\n');
}

function transformMessages(messages: IncomingMsg[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of messages) {
    const hasImages = !!(m.images && m.images.length);
    const hasToolUses = !!(m.toolUses && m.toolUses.length);
    const hasToolResults = !!(m.toolResults && m.toolResults.length);

    if (m.role === 'assistant' && hasToolUses) {
      const blocks: ContentBlock[] = [];
      if (m.content && m.content.trim()) {
        blocks.push({ type: 'text', text: m.content });
      }
      for (const tu of m.toolUses!) {
        blocks.push({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input ?? {},
        });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }

    if (m.role === 'user' && hasToolResults) {
      const blocks: ContentBlock[] = [];
      for (const tr of m.toolResults!) {
        const block: ToolResultBlock = {
          type: 'tool_result',
          tool_use_id: tr.tool_use_id,
          content: tr.content,
        };
        if (tr.is_error) block.is_error = true;
        blocks.push(block);
      }
      if (m.content && m.content.trim()) {
        blocks.push({ type: 'text', text: m.content });
      }
      out.push({ role: 'user', content: blocks });
      continue;
    }

    if (m.role === 'user' && hasImages) {
      const blocks: ContentBlock[] = [];
      for (const img of m.images!) {
        if (img.data && img.data.length > 0) {
          // Full base64 available — send as vision block for Claude to analyze
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: img.mime, data: img.data },
          });
          blocks.push({ type: 'text', text: imageHintText(img.kind, img.name) });
        } else if (img.url) {
          // Already saved and analyzed — reference by URL to avoid re-sending base64
          blocks.push({
            type: 'text',
            text: `[${img.kind.toUpperCase()} REFERENCE: ${img.name}] Already uploaded and saved to assets (${img.url}). Previously analyzed — use your earlier analysis from this conversation. Do not request re-upload.`,
          });
        }
      }
      if (m.content && m.content.trim()) {
        blocks.push({ type: 'text', text: m.content });
      }
      out.push({ role: 'user', content: blocks });
      continue;
    }

    out.push({ role: m.role, content: m.content ?? '' });
  }
  return out;
}

/* ============================================================================
 * Route
 * ========================================================================== */

export async function POST(req: NextRequest) {
  let body: ClientBody;
  try {
    body = (await req.json()) as ClientBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const { messages, model, clientContext } = body;
  if (!messages || !Array.isArray(messages)) {
    return new Response(
      JSON.stringify({ error: 'messages[] required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const rawBaseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const resolvedLocal = await resolveLocalUpstream(rawBaseUrl);
  const baseUrl = resolvedLocal ?? rawBaseUrl;
  if (resolvedLocal && resolvedLocal !== rawBaseUrl) {
    console.log(`[chat] pclaude resolved: ${rawBaseUrl} → ${resolvedLocal}`);
  } else if (resolvedLocal === null) {
    console.warn(`[chat] pclaude not listening on pool 13141-13150; skipping primary upstream`);
  }
  const fallbackUrl = process.env.ANTHROPIC_BASE_URL_FALLBACK?.replace(/\/$/, '');
  const fallbackUrl2 = process.env.ANTHROPIC_BASE_URL_FALLBACK2?.replace(/\/$/, '');
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  const vibecdToken = process.env.ANTHROPIC_AUTH_TOKEN_VIBECD;
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Missing ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const provider = clientContext?.provider;
  const systemPrompt = buildSystemPrompt(provider, clientContext);

  // Hydrate URL-only images by reading bytes from disk — but ONLY for the LATEST
  // user turn. Older messages keep their URL-only text pointer (transformMessages
  // converts those to "[REF: name] previously analyzed" stubs). Sending hydrated
  // bytes for many turns blows past nginx 1MB request limits on RouteAI.
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  })();
  if (lastUserIdx >= 0) {
    const m = messages[lastUserIdx];
    if (m.images?.length) {
      await Promise.all(
        m.images.map(async (img) => {
          if (img.data && img.data.length > 0) {
            // Already-hydrated payload from client. Re-encode if oversized
            // (catches legacy chats with giant base64 still in memory).
            const approxBytes = (img.data.length * 3) / 4;
            if (approxBytes > 500_000) {
              try {
                const inBuf = Buffer.from(img.data, 'base64');
                const outBuf = await sharp(inBuf)
                  .rotate()
                  .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
                  .jpeg({ quality: 85, mozjpeg: true })
                  .toBuffer();
                console.log(`[chat/downscale] in-memory ${(inBuf.length/1024).toFixed(0)}KB → ${(outBuf.length/1024).toFixed(0)}KB`);
                img.data = outBuf.toString('base64');
                img.mime = 'image/jpeg';
              } catch (err) {
                console.warn('[chat/downscale] in-memory resize failed:', err instanceof Error ? err.message : err);
              }
            }
            return;
          }
          if (!img.url) return;
          try {
            const filePath = urlToFilePath(img.url);
            const buf = await readFile(filePath);
            // Always re-encode disk reads through sharp — old assets saved before
            // downscale fix are still giant PNGs. Caps longest edge at 2048, JPEG q=85.
            try {
              const out = await sharp(buf)
                .rotate()
                .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer();
              console.log(`[chat/hydrate] ${(buf.length/1024).toFixed(0)}KB → ${(out.length/1024).toFixed(0)}KB (${img.url})`);
              img.data = out.toString('base64');
              img.mime = 'image/jpeg';
            } catch {
              // sharp can't decode (svg/gif/etc.) — fall back to raw bytes
              img.data = buf.toString('base64');
              if (!img.mime) img.mime = 'image/png';
            }
          } catch (err) {
            console.warn('[chat/hydrate] failed to load image:', img.url, err instanceof Error ? err.message : err);
          }
        }),
      );
    }
  }

  const apiMessages = transformMessages(messages);
  const rollingMarkers = addRollingCacheMarkers(apiMessages);

  // Hybrid model + tiered thinking strategy:
  // Vision turns → deepest thinking (visual analysis is hard).
  // Creative-output turns ("generate", "build a prompt", "spec the model") → deep thinking for quality.
  // Form / chip / quick-ack turns → small thinking budget so it responds fast.
  // Bare greetings / trivial → no thinking at all (instant reply).
  const latestUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const hasLiveImages = !!(latestUserMsg?.images?.some(img => img.data && img.data.length > 0));
  const latestText = (latestUserMsg?.content ?? '').trim();
  const lowText = latestText.toLowerCase();

  // Detect expected complexity from latest user message
  const isFormAnswer = lowText.startsWith('form answers:');
  const isShortTrivial = latestText.length > 0 && latestText.length < 40 && !isFormAnswer;
  const isBareGreeting = /^(hi|hello|hey|yo|sup|hola|good\s+(morning|afternoon|evening))[\s!.?]*$/i.test(latestText);
  const isCreativeAsk =
    /\b(generate|create|make|build|design|draft|write|spec|describe|compose|render|produce|stage|develop|craft)\b/i.test(latestText) ||
    /\b(master\s*prompt|model\s*block|setting\s*block|product\s*block|carousel|moodboard|brief)\b/i.test(latestText) ||
    /\b(let'?s\s+(go|create|build|make|design|generate|proceed|run|do))\b/i.test(latestText) ||
    isFormAnswer;

  const OPUS   = 'claude-opus-4-7';
  const SONNET = 'claude-sonnet-4-6';

  // Env var overrides both; otherwise hybrid auto-selects (Opus on vision turns)
  const resolvedModel = model || process.env.ANTHROPIC_MODEL || (hasLiveImages ? OPUS : SONNET);

  // Thinking budget tiers
  let thinkingBudget = 0;
  let maxOutput = 4000;
  if (hasLiveImages) {
    thinkingBudget = 24000; // visual analysis + deep planning
    maxOutput = 6000;
  } else if (isCreativeAsk) {
    thinkingBudget = 12000; // master prompts, blocks, briefs need quality
    maxOutput = 6000;
  } else if (isBareGreeting) {
    thinkingBudget = 0; // no thinking — instant reply
    maxOutput = 1500;
  } else if (isShortTrivial) {
    thinkingBudget = 1024; // minimal reasoning
    maxOutput = 2000;
  } else {
    thinkingBudget = 4000; // chips, follow-ups, mid-conversation acks
    maxOutput = 4000;
  }
  const enableThinking = thinkingBudget >= 1024;

  // Single payload — same shape for all upstreams. Untested whether vibecd honors
  // cache_control; sending it anyway. Worst case it ignores the marker (unknown
  // fields don't break Anthropic-compatible parsers).
  const systemBlocks = [
    { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
  ];
  const toolsArr = TOOLS.map((t, i) =>
    i === TOOLS.length - 1
      ? { ...t, cache_control: { type: 'ephemeral' as const } }
      : t,
  );
  const payloadBody = JSON.stringify({
    model: resolvedModel,
    max_tokens: enableThinking ? (thinkingBudget + maxOutput) : maxOutput,
    system: systemBlocks,
    messages: apiMessages,
    stream: true,
    tools: toolsArr,
    ...(enableThinking ? { thinking: { type: 'enabled', budget_tokens: thinkingBudget } } : {}),
  });
  const payloadSize = Buffer.byteLength(payloadBody, 'utf8');
  console.log(`[chat] payload size: ${(payloadSize / 1024).toFixed(1)} KB (${apiMessages.length} msgs, model=${resolvedModel}, thinking=${enableThinking ? thinkingBudget : 0}, cache_markers=${2 + rollingMarkers})`);
  if (payloadSize > 950_000) {
    console.warn(`[chat] payload ${(payloadSize / 1024).toFixed(1)} KB exceeds typical nginx 1MB limit — RouteAI/vibecd may 413`);
  }

  /* ----- upstream with retry ----- */
  const abortCtl = new AbortController();
  const onAbort = () => {
    try { abortCtl.abort(); } catch { /* ignore */ }
  };
  req.signal.addEventListener('abort', onAbort);

  const attemptUpstream = async (url: string): Promise<Response> => {
    const isPclaudeProxy =
      /\/\/(localhost|127\.0\.0\.1)/i.test(url) && process.env.USE_PCLAUDE_TOKEN_POOL === '1';
    const isVibecd = url.includes('vibecd.cc');
    const useToken = isVibecd && vibecdToken ? vibecdToken : token;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    };
    if (!isPclaudeProxy) {
      headers['x-api-key'] = useToken;
      headers.authorization = `Bearer ${useToken}`;
    }
    return fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers,
      body: payloadBody,
      signal: abortCtl.signal,
    });
  };

  // Build ordered upstream chain: primary → fallback → fallback2.
  // Skip primary if it's a localhost URL that didn't resolve to a live pclaude port.
  const primaryIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)/i.test(rawBaseUrl);
  const upstreamChain: string[] = [];
  if (!(primaryIsLocal && resolvedLocal === null)) {
    upstreamChain.push(baseUrl);
  }
  if (fallbackUrl && !upstreamChain.includes(fallbackUrl)) upstreamChain.push(fallbackUrl);
  if (fallbackUrl2 && !upstreamChain.includes(fallbackUrl2)) upstreamChain.push(fallbackUrl2);

  const BACKOFF_MS = [300];
  const MAX_ATTEMPTS = upstreamChain.length;
  let upstream: Response | null = null;
  let lastStatus = 0;
  let lastShortMsg = '';

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const currentUrl = upstreamChain[i];

    console.log(`[chat] upstream attempt ${i + 1}/${MAX_ATTEMPTS} → ${currentUrl}`);
    try {
      const r = await attemptUpstream(currentUrl);
      console.log(`[chat] upstream responded: ${r.status} ${r.statusText} (body? ${!!r.body})`);
      if (r.ok && r.body) {
        upstream = r;
        break;
      }
      lastStatus = r.status;
      const txt = await r.text().catch(() => '');
      lastShortMsg = shortenUpstreamError(r.status, txt);
      console.log(`[chat] upstream error body: ${txt.slice(0, 200)}`);
      if (!isRetryable(r.status)) break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lastStatus = 0;
      lastShortMsg = `network error (${msg})`;
      console.error(`[chat] upstream exception:`, msg);
      if (abortCtl.signal.aborted) break;
    }
    if (i < MAX_ATTEMPTS - 1) {
      await new Promise((res) => setTimeout(res, BACKOFF_MS[0]));
    }
  }

  if (!upstream || !upstream.body) {
    req.signal.removeEventListener('abort', onAbort);
    const line =
      JSON.stringify({
        type: 'error',
        message: lastShortMsg || 'upstream unavailable',
      }) + '\n';
    return new Response(line, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    });
  }

  /* ----- NDJSON transform stream ----- */
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const emit = async (obj: Record<string, unknown>) => {
    try {
      await writer.write(enc.encode(JSON.stringify(obj) + '\n'));
    } catch {
      /* writer closed */
    }
  };

  (async () => {
    const reader = upstream!.body!.getReader();
    let buf = '';
    let currentBlock: CurrentBlock | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreateTokens = 0;
    let stopReason: string | null = null;
    let doneEmitted = false;
    let sawError = false;

    // Thinking progress relay — server-side timer that pings the client every 2s while
    // a thinking block is open, so user sees something is happening (elapsed seconds + chars).
    let thinkingChars = 0;
    let thinkingStartMs = 0;
    let thinkingTimer: ReturnType<typeof setInterval> | null = null;
    const startThinkingHeartbeat = () => {
      thinkingChars = 0;
      thinkingStartMs = Date.now();
      if (thinkingTimer) clearInterval(thinkingTimer);
      thinkingTimer = setInterval(() => {
        emit({
          type: 'thinking_status',
          elapsedMs: Date.now() - thinkingStartMs,
          chars: thinkingChars,
        }).catch(() => {});
      }, 2000);
    };
    const stopThinkingHeartbeat = () => {
      if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
    };

    const handleEvent = async (evt: SSEEvent) => {
      const t = evt.type;
      if (t === 'content_block_start') {
        const e = evt as SSEContentBlockStart;
        const cb = e.content_block;
        if (cb.type === 'tool_use') {
          currentBlock = {
            type: 'tool_use',
            id: cb.id,
            name: cb.name,
            partialJson: '',
          };
        } else if (cb.type === 'thinking') {
          currentBlock = { type: 'thinking' }; // silently consume — don't stream to client
          startThinkingHeartbeat();
          await emit({ type: 'thinking_start' });
        } else if (cb.type === 'text') {
          currentBlock = { type: 'text' };
        } else {
          currentBlock = { type: 'text' };
        }
        return;
      }

      if (t === 'content_block_delta') {
        const e = evt as SSEContentBlockDelta;
        const d = e.delta;
        if (d.type === 'thinking_delta') {
          // Track size for heartbeat — content not relayed (private reasoning)
          thinkingChars += (d.thinking?.length ?? 0);
          return;
        } else if (d.type === 'text_delta') {
          if (currentBlock?.type === 'thinking') return; // safety: skip if block mismatch
          await emit({ type: 'text', delta: d.text });
        } else if (d.type === 'input_json_delta') {
          if (currentBlock && currentBlock.type === 'tool_use') {
            currentBlock.partialJson =
              (currentBlock.partialJson || '') + (d.partial_json || '');
          }
        }
        return;
      }

      if (t === 'content_block_stop') {
        if (currentBlock && currentBlock.type === 'thinking') {
          stopThinkingHeartbeat();
          await emit({ type: 'thinking_end', elapsedMs: Date.now() - thinkingStartMs, chars: thinkingChars });
        }
        if (currentBlock && currentBlock.type === 'tool_use') {
          let parsed: Record<string, unknown> = {};
          const raw = currentBlock.partialJson || '';
          if (raw.trim().length > 0) {
            try {
              parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              parsed = {};
            }
          }
          await emit({
            type: 'tool_use',
            id: currentBlock.id,
            name: currentBlock.name,
            input: parsed,
          });
        }
        currentBlock = null;
        return;
      }

      if (t === 'message_start') {
        const e = evt as SSEMessageStart;
        const u = e.message?.usage;
        if (u) {
          if (typeof u.input_tokens === 'number') inputTokens = u.input_tokens;
          if (typeof u.output_tokens === 'number') outputTokens = u.output_tokens;
          if (typeof u.cache_read_input_tokens === 'number') cacheReadTokens = u.cache_read_input_tokens;
          if (typeof u.cache_creation_input_tokens === 'number') cacheCreateTokens = u.cache_creation_input_tokens;
          await emit({ type: 'usage', input: inputTokens, output: outputTokens });
        }
        return;
      }

      if (t === 'message_delta') {
        const e = evt as SSEMessageDelta;
        if (e.usage) {
          if (typeof e.usage.input_tokens === 'number') inputTokens = e.usage.input_tokens;
          if (typeof e.usage.output_tokens === 'number') outputTokens = e.usage.output_tokens;
          if (typeof e.usage.cache_read_input_tokens === 'number') cacheReadTokens = e.usage.cache_read_input_tokens;
          if (typeof e.usage.cache_creation_input_tokens === 'number') cacheCreateTokens = e.usage.cache_creation_input_tokens;
          await emit({ type: 'usage', input: inputTokens, output: outputTokens });
        }
        if (e.delta && e.delta.stop_reason) {
          stopReason = e.delta.stop_reason;
        }
        return;
      }

      if (t === 'message_stop') {
        if (!doneEmitted) {
          const totalIn = inputTokens + cacheReadTokens + cacheCreateTokens;
          const hitPct = totalIn > 0 ? ((cacheReadTokens / totalIn) * 100).toFixed(1) : '0.0';
          console.log(`[chat] tokens: in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_create=${cacheCreateTokens} hit=${hitPct}%`);
          await emit({ type: 'done', stop_reason: stopReason ?? 'end_turn' });
          doneEmitted = true;
        }
        return;
      }

      if (t === 'error') {
        const e = evt as SSEError;
        sawError = true;
        await emit({
          type: 'error',
          message: e.error?.message || 'upstream stream error',
        });
        return;
      }
    };

    try {
      console.log('[chat] SSE read loop started');
      let bytesReceived = 0;
      let eventsParsed = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[chat] SSE stream ended (received ${bytesReceived} bytes, parsed ${eventsParsed} events)`);
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
            if (ln.startsWith('data: ')) data += ln.slice(6);
            else if (ln.startsWith('data:')) data += ln.slice(5);
          }
          if (!data) continue;
          if (data === '[DONE]') continue;
          let evt: SSEEvent;
          try {
            evt = JSON.parse(data) as SSEEvent;
          } catch {
            continue;
          }
          eventsParsed += 1;
          if (eventsParsed <= 3 || eventsParsed % 50 === 0) {
            console.log(`[chat] event #${eventsParsed}: ${evt.type}`);
          }
          await handleEvent(evt);
        }
      }
      if (!doneEmitted && !sawError) {
        await emit({ type: 'done', stop_reason: stopReason ?? 'end_turn' });
        doneEmitted = true;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[chat] SSE read loop error:', msg);
      if (!abortCtl.signal.aborted) {
        await emit({ type: 'error', message: `stream error: ${msg}` });
      }
    } finally {
      stopThinkingHeartbeat();
      req.signal.removeEventListener('abort', onAbort);
      try { await writer.close(); } catch { /* ignore */ }
    }
  })();

  return new Response(readable, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  });
}
