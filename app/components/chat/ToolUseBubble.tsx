'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Check, X } from 'lucide-react';
import { useState } from 'react';
import { TOOL_DISPLAY } from '../../lib/chatTools';

interface Props {
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  errorMsg?: string;
}

export default function ToolUseBubble({ name, input, status, result, errorMsg }: Props) {
  const [open, setOpen] = useState(false);
  const meta = (TOOL_DISPLAY as Record<string, { label: string; emoji: string }>)[name] ?? { label: name, emoji: '🔧' };

  const statusClass =
    status === 'error'
      ? 'border-red-300 bg-red-50/80'
      : status === 'success'
      ? 'border-emerald-300 bg-emerald-50/80'
      : 'border-zinc-200 bg-white/90';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={`my-2 overflow-hidden rounded-lg border ${statusClass}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-zinc-400"
        >
          <ChevronRight size={14} />
        </motion.span>
        <span className="text-base leading-none">{meta.emoji}</span>
        <span className="flex-1 truncate font-medium text-zinc-800">{meta.label}</span>
        <StatusDot status={status} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-zinc-200/70 bg-zinc-50/70"
          >
            <div className="max-h-[200px] overflow-auto px-3 py-2">
              <pre className="whitespace-pre-wrap break-words text-xs text-zinc-700">
                {JSON.stringify(input, null, 2)}
              </pre>
              {status === 'success' && result && (
                <>
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Result
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-emerald-900">
                    {result}
                  </pre>
                </>
              )}
              {status === 'error' && errorMsg && (
                <>
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    Error
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-xs text-red-900">
                    {errorMsg}
                  </pre>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusDot({ status }: { status: Props['status'] }) {
  if (status === 'success')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
        <X size={12} strokeWidth={3} />
      </span>
    );
  if (status === 'running')
    return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />;
  return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-zinc-400" />;
}
