'use client';

import { Copy, Check, Package, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Message as Msg, ToolUseRecord } from '../../lib/chatStore';
import Markdown from './Markdown';
import ToolUseBubble from './ToolUseBubble';
import FollowUpChips from './FollowUpChips';
import IntakeForm from './IntakeForm';
import AssetPicker from './AssetPicker';
import { parseStructuredResponse } from '../../lib/structuredResponse';

interface Props {
  message: Msg;
  streaming?: boolean;
  onQuickReply?: (description: string) => void;
}

const assistantProseStyle: React.CSSProperties & Record<string, string> = {
  color: 'var(--studio-text)',
  fontSize: '11px',
  lineHeight: '1.5',
  ['--tw-prose-body' as string]: 'var(--studio-text)',
  ['--tw-prose-headings' as string]: 'var(--studio-text)',
  ['--tw-prose-bold' as string]: 'var(--studio-text)',
  ['--tw-prose-links' as string]: 'var(--studio-accent)',
  ['--tw-prose-code' as string]: 'var(--studio-text)',
  ['--tw-prose-quotes' as string]: 'var(--studio-text-sec)',
  ['--tw-prose-bullets' as string]: 'var(--studio-text-muted)',
  ['--tw-prose-counters' as string]: 'var(--studio-text-muted)',
  ['--tw-prose-hr' as string]: 'var(--studio-border)',
};

function detectThinkingPhase(content: string): string | null {
  if (!content) return 'Thinking…';
  if (/\[API:/i.test(content)) return 'Building master prompt…';
  if (/🧍|model block|skin tone|fitzpatrick/i.test(content)) return 'Describing the model…';
  if (/🏖|setting block|lighting|environment/i.test(content)) return 'Shaping the setting…';
  if (/📦|product block|material|reflectivity/i.test(content)) return 'Analyzing the product…';
  if (/⚙|configuration|temperature|top_p/i.test(content))
    return 'Configuring generation parameters…';
  if (/📋|creative brief|brief summary/i.test(content)) return 'Drafting the brief…';
  if (/🎬|master prompt/i.test(content)) return 'Stitching master prompt…';
  return 'Thinking…';
}

function looksStructuredPending(content: string): boolean {
  const trimmed = content.trimStart();
  if (!trimmed) return false;
  if (/^```(?:json)?\s*\n?\s*\{/.test(trimmed)) return true;
  if (/^\{\s*"?(question|follow_up)"?/i.test(trimmed)) return true;
  if (/^\{\s*"?form"?/i.test(trimmed)) return true;
  if (/^```(?:json)?\s*\n?\s*\{\s*"?form"?/i.test(trimmed)) return true;
  if (/^\{\s*"?asset_picker"?/i.test(trimmed)) return true;
  if (/^```(?:json)?\s*\n?\s*\{\s*"?asset_picker"?/i.test(trimmed)) return true;
  return false;
}

export default function Message({ message, streaming, onQuickReply }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (isUser) {
    return (
      <div className="group relative flex justify-end px-3 py-1.5">
        <div
          className="relative max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2"
          style={{
            background: 'color-mix(in srgb, var(--studio-accent) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--studio-accent) 35%, transparent)',
            color: 'var(--studio-text)',
          }}
        >
          {message.images && message.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.images.map((img) => (
                <div
                  key={img.id}
                  className="relative overflow-hidden rounded-lg"
                  style={{ border: '1px solid var(--studio-border)' }}
                >
                  <img
                    src={img.data ? `data:${img.mime};base64,${img.data}` : (img.url ?? '')}
                    alt={img.name}
                    className="max-h-32 w-auto"
                  />
                  <span
                    className={`absolute left-1 top-1 flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      img.kind === 'product'
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-indigo-500/90 text-white'
                    }`}
                  >
                    {img.kind === 'product' ? <Package size={9} /> : <Sparkles size={9} />}
                    {img.kind}
                  </span>
                </div>
              ))}
            </div>
          )}
          {message.content && (
            <div
              className="whitespace-pre-wrap break-words"
              style={{ fontSize: '11px', lineHeight: 1.5 }}
            >
              {message.content}
            </div>
          )}
          {message.content && (
            <button
              type="button"
              onClick={copy}
              className="absolute -left-8 top-2 rounded-md p-1 opacity-0 transition group-hover:opacity-100"
              style={{
                background: 'var(--studio-elevated)',
                border: '1px solid var(--studio-border)',
                color: 'var(--studio-text-sec)',
              }}
              aria-label="Copy message"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>
      </div>
    );
  }

  const thinkingPhase =
    streaming && !message.content ? detectThinkingPhase(message.content) : null;
  const liveThinking = message.thinking;
  const toolUses: ToolUseRecord[] = message.toolUses ?? [];
  const parsed = message.content ? parseStructuredResponse(message.content) : null;
  const hasStructured = !!parsed?.structured;
  const hasForm = !!parsed?.form;
  const hasAssetPicker = !!parsed?.assetPicker;
  const pendingStructured =
    streaming && !hasStructured && !hasForm && !hasAssetPicker && looksStructuredPending(message.content ?? '');

  // Fallback timer: counts seconds since this empty message first appeared, used when the
  // server doesn't relay thinking_status events (e.g. dev server not yet restarted).
  const [fallbackSec, setFallbackSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    const isEmpty = streaming && !message.content && !liveThinking?.active;
    if (!isEmpty) {
      startedAtRef.current = null;
      setFallbackSec(0);
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const t = setInterval(() => {
      if (startedAtRef.current !== null) {
        setFallbackSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [streaming, message.content, liveThinking?.active]);

  // Fast re-render tick so token counter visibly ticks between server updates (every 2s).
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(t);
  }, [streaming]);

  // Track chars rate during thinking so we can interpolate tokens between heartbeats.
  const lastThinkRef = useRef<{ at: number; chars: number; rate: number } | null>(null);
  useEffect(() => {
    if (!liveThinking?.active) {
      lastThinkRef.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastThinkRef.current;
    const chars = liveThinking.chars ?? 0;
    let rate = prev?.rate ?? 0;
    if (prev && now > prev.at && chars >= prev.chars) {
      const observed = (chars - prev.chars) / (now - prev.at);
      // Smooth: bias toward observed once we have a real sample.
      rate = prev.rate > 0 ? prev.rate * 0.4 + observed * 0.6 : observed;
    }
    lastThinkRef.current = { at: now, chars, rate };
  }, [liveThinking?.active, liveThinking?.chars]);

  const interpolatedThinkChars = (() => {
    if (!liveThinking) return 0;
    if (!liveThinking.active) return liveThinking.chars ?? 0;
    const last = lastThinkRef.current;
    if (!last) return liveThinking.chars ?? 0;
    const dt = Math.max(0, Date.now() - last.at);
    return Math.floor(last.chars + last.rate * dt);
  })();

  // Unified pill: prefer server-driven liveThinking; else fallback ticker
  const pillSec = liveThinking?.active
    ? Math.max(
        1,
        Math.round(
          ((liveThinking.elapsedMs ?? 0) +
            Math.max(0, Date.now() - (lastThinkRef.current?.at ?? Date.now()))) /
            1000,
        ),
      )
    : (streaming && !message.content ? Math.max(0, fallbackSec) : null);
  const liveTokens = streaming
    ? Math.round((interpolatedThinkChars + (message.content?.length ?? 0)) / 4)
    : 0;
  const pillTokens = streaming && liveTokens > 0 ? liveTokens : null;
  const pillLabel = thinkingPhase && thinkingPhase !== 'Thinking…' ? thinkingPhase : 'Thinking…';

  return (
    <div className="group relative flex flex-col items-start px-3 py-1.5">
      {pillSec !== null && (
        <div
          className="mb-2 flex items-center gap-2 rounded-full px-2.5 py-1"
          style={{
            background: 'color-mix(in srgb, var(--studio-accent) 12%, var(--studio-surface))',
            border: '1px solid color-mix(in srgb, var(--studio-accent) 40%, transparent)',
            color: 'var(--studio-accent)',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span className="flex h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--studio-accent)' }} />
          {pillLabel} {pillSec}s
          {pillTokens !== null && (
            <span style={{ color: 'var(--studio-text-muted)', fontWeight: 500, fontSize: 10 }}>
              · ~{pillTokens.toLocaleString()} tok
            </span>
          )}
        </div>
      )}

      {message.content && (
        <div
          className="relative max-w-[92%] rounded-2xl rounded-bl-sm px-3 py-2"
          style={{
            background: 'var(--studio-surface)',
            border: '1px solid var(--studio-border)',
            color: 'var(--studio-text)',
          }}
        >

          {hasAssetPicker ? (
            <>
              {parsed?.preface && (
                <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
                  <Markdown content={parsed.preface} />
                </div>
              )}
              <AssetPicker
                config={parsed!.assetPicker!}
                onSubmit={onQuickReply ?? (() => {})}
                disabled={streaming}
              />
              {parsed?.trailing && (
                <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
                  <Markdown content={parsed.trailing} />
                </div>
              )}
            </>
          ) : hasStructured ? (
            <>
              {parsed?.preface && (
                <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
                  <Markdown content={parsed.preface} />
                </div>
              )}
              <FollowUpChips
                question={parsed!.structured!.question}
                options={parsed!.structured!.follow_up}
                onSelect={onQuickReply ?? (() => {})}
                disabled={streaming}
              />
              {parsed?.trailing && (
                <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
                  <Markdown content={parsed.trailing} />
                </div>
              )}
            </>
          ) : hasForm ? (
            <>
              {parsed?.preface && (
                <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
                  <Markdown content={parsed.preface} />
                </div>
              )}
              <IntakeForm
                form={parsed!.form!}
                onSubmit={onQuickReply ?? (() => {})}
                disabled={streaming}
              />
              {parsed?.trailing && (
                <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
                  <Markdown content={parsed.trailing} />
                </div>
              )}
            </>
          ) : pendingStructured ? (
            <div
              className="flex items-center gap-2"
              style={{ fontSize: 12, color: 'var(--studio-text-muted)', fontStyle: 'italic' }}
            >
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-violet-500" />
              Preparing options…
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none" style={assistantProseStyle}>
              <Markdown content={message.content} />
            </div>
          )}
          {!streaming && (
            <div className="absolute -right-8 top-2 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={copy}
                className="rounded-md p-1"
                style={{
                  background: 'var(--studio-elevated)',
                  border: '1px solid var(--studio-border)',
                  color: 'var(--studio-text-sec)',
                  cursor: 'pointer',
                }}
                aria-label="Copy message"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>
      )}

      {toolUses.length > 0 && (
        <div className="mt-2 w-full max-w-[92%]">
          {toolUses.map((t) => (
            <ToolUseBubble
              key={t.id}
              name={t.name}
              input={t.input}
              status={t.status}
              result={
                t.result === undefined || t.result === null
                  ? undefined
                  : typeof t.result === 'string'
                  ? t.result
                  : JSON.stringify(t.result, null, 2)
              }
              errorMsg={t.errorMsg}
            />
          ))}
        </div>
      )}
    </div>
  );
}
