'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ModelOption {
  id: string;
  label: string;
  tier: 'balanced' | 'max' | 'fast';
  note?: string;
}

const MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'balanced', note: 'default' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', tier: 'max', note: 'most capable' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', tier: 'fast', note: 'fastest' },
];

const LS_KEY = 'nbs-chat-model';
const DEFAULT = 'claude-sonnet-4-6';

interface Props {
  value?: string;
  onChange: (id: string) => void;
}

export default function ModelPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value ?? DEFAULT);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (value) return;
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored && MODELS.some((m) => m.id === stored)) {
      setCurrent(stored);
      onChange(stored);
    } else {
      onChange(DEFAULT);
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

  const pick = (id: string) => {
    setCurrent(id);
    onChange(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_KEY, id);
    setOpen(false);
  };

  const active = MODELS.find((m) => m.id === current) ?? MODELS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <span>{active.label}</span>
        <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-52 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-zinc-50 ${
                m.id === current ? 'bg-zinc-50' : ''
              }`}
            >
              <div>
                <div className="font-medium text-zinc-900">{m.label}</div>
                {m.note && <div className="text-[10px] text-zinc-500">{m.note}</div>}
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  m.tier === 'max'
                    ? 'bg-violet-100 text-violet-700'
                    : m.tier === 'fast'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {m.tier}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { MODELS, DEFAULT as DEFAULT_MODEL };
