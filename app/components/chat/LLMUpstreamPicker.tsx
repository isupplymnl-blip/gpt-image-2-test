'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LLMAdapterId } from '../../lib/llm/types';

interface UpstreamOption {
  id: LLMAdapterId;
  label: string;
  note: string;
  color: string;
}

const OPTIONS: UpstreamOption[] = [
  { id: 'anthropic',      label: 'Direct',   note: 'api.anthropic.com', color: '#10B981' },
  { id: 'priority-claude', label: 'Priority', note: 'routeai.cc',       color: '#8B5CF6' },
  { id: 'vibecd',         label: 'Vibecd',   note: 'vibecd.cc',         color: '#F59E0B' },
];

const LS_KEY = 'nbs-llm-upstream';
export const DEFAULT_UPSTREAM: LLMAdapterId = 'anthropic';

interface Props {
  value?: LLMAdapterId;
  onChange: (id: LLMAdapterId) => void;
  disabled?: boolean;
}

export default function LLMUpstreamPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen]     = useState(false);
  const [current, setCurrent] = useState<LLMAdapterId>(value ?? DEFAULT_UPSTREAM);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (value) return;
    const stored = window.localStorage.getItem(LS_KEY) as LLMAdapterId | null;
    if (stored && OPTIONS.some(o => o.id === stored)) {
      setCurrent(stored);
      onChange(stored);
    } else {
      onChange(DEFAULT_UPSTREAM);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value && value !== current) setCurrent(value);
  }, [value, current]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (id: LLMAdapterId) => {
    setCurrent(id);
    onChange(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_KEY, id);
    setOpen(false);
  };

  const active = OPTIONS.find(o => o.id === current) ?? OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        title={`Chat upstream: ${active.note}`}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: active.color, flexShrink: 0 }}
        />
        <span>{active.label}</span>
        <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {OPTIONS.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition hover:bg-zinc-50 ${
                o.id === current ? 'bg-zinc-50' : ''
              }`}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: '50%', background: o.color, flexShrink: 0 }}
              />
              <div>
                <div className="font-medium text-zinc-900">{o.label}</div>
                <div className="text-[9px] text-zinc-400">{o.note}</div>
              </div>
              {o.id === current && (
                <span className="ml-auto text-[10px] text-zinc-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { OPTIONS as LLM_UPSTREAM_OPTIONS };
