'use client';

import { Sparkles } from 'lucide-react';

interface AutomateButtonProps {
  onClick: () => void;
  variant?: 'toolbar' | 'compact';
}

export default function AutomateButton({ onClick, variant = 'toolbar' }: AutomateButtonProps) {
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <button
        onClick={onClick}
        title="Automate a batch (Ctrl/⌘ A)"
        aria-label="Automate a batch"
        className="group inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-400/30 bg-gradient-to-br from-violet-500/15 to-teal-500/15 text-violet-300 transition hover:border-violet-400/60 hover:from-violet-500/25 hover:to-teal-500/25 hover:text-white"
      >
        <Sparkles className="h-4 w-4 transition group-hover:scale-110" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      title="Automate a batch"
      aria-label="Automate a batch"
      style={{
        padding: '5px 11px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 6,
        border: '1px solid var(--studio-border)',
        background: 'var(--studio-elevated)',
        color: 'var(--studio-text-sec)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Sparkles style={{ width: 11, height: 11 }} />
      <span>Automate</span>
    </button>
  );
}
