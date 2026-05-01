'use client';

import { motion } from 'framer-motion';
import { Send, Square } from 'lucide-react';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

export interface ComposerHandle {
  /** Read current input value (for parent submit logic) */
  getValue: () => string;
  /** Clear the input (call after successful submit) */
  clear: () => void;
  /** Focus the textarea */
  focus: () => void;
}

interface Props {
  /** Called on submit (Enter or send button) — parent reads value via ref */
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  canStop?: boolean;
  hasAttachments?: boolean;
  /** Called when value transitions from empty <-> non-empty (cheap) — parent uses for canSend gating */
  onEmptyChange?: (isEmpty: boolean) => void;
}

const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { onSubmit, onStop, streaming, canStop = true, hasAttachments, onEmptyChange },
  refOut,
) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Local state — typing here does NOT re-render parent
  const [hasText, setHasText] = useState(false);

  useImperativeHandle(refOut, () => ({
    getValue: () => taRef.current?.value ?? '',
    clear: () => {
      if (taRef.current) {
        taRef.current.value = '';
        taRef.current.style.height = 'auto';
      }
      setHasText(false);
      onEmptyChange?.(true);
    },
    focus: () => taRef.current?.focus(),
  }), [onEmptyChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
    const empty = !el.value.trim();
    if (empty === hasText) {
      setHasText(!empty);
      onEmptyChange?.(empty);
    }
  }, [hasText, onEmptyChange]);

  const canSend = hasText || !!hasAttachments;
  const send = useCallback(() => {
    if (streaming || !canSend) return;
    onSubmit();
  }, [streaming, canSend, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }, [send]);

  // Initial autosize
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, []);

  // Keep "hasAttachments" reflected in canSend
  useEffect(() => {
    onEmptyChange?.(!hasText);
  }, [hasAttachments, hasText, onEmptyChange]);

  const buttonDisabled = streaming ? !canStop : !canSend;

  return (
    <div className="w-full max-w-3xl mx-auto px-2">
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative rounded-2xl transition-all"
        style={{
          background: 'var(--studio-elevated)',
          border: '1px solid var(--studio-border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}
      >
        <textarea
          ref={taRef}
          defaultValue=""
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe your scene, product, or shoot idea…"
          rows={1}
          className="w-full px-4 pt-3.5 pb-2 pr-14 outline-none resize-none"
          style={{
            background: 'transparent',
            color: 'var(--studio-text)',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        />
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <div style={{ fontSize: 10, color: 'var(--studio-text-muted)' }}>
            <kbd
              style={{
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid var(--studio-border)',
                background: 'var(--studio-surface)',
                fontSize: 9,
                color: 'var(--studio-text-sec)',
                fontFamily: 'inherit',
              }}
            >
              ⏎
            </kbd>{' '}
            send ·{' '}
            <kbd
              style={{
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid var(--studio-border)',
                background: 'var(--studio-surface)',
                fontSize: 9,
                color: 'var(--studio-text-sec)',
                fontFamily: 'inherit',
              }}
            >
              ⇧⏎
            </kbd>{' '}
            newline
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={streaming ? onStop : send}
            disabled={buttonDisabled}
            className="flex items-center justify-center disabled:cursor-not-allowed"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: buttonDisabled
                ? 'var(--studio-surface)'
                : 'var(--studio-accent)',
              color: buttonDisabled ? 'var(--studio-text-muted)' : '#fff',
              opacity: buttonDisabled ? 0.5 : 1,
              cursor: buttonDisabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, opacity 0.15s',
            }}
            aria-label={streaming ? 'Stop' : 'Send'}
          >
            {streaming ? <Square size={12} fill="currentColor" /> : <Send size={14} strokeWidth={2.5} />}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
});

export default memo(Composer);
