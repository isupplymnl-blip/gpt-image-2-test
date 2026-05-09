/**
 * Provider Selector Component
 * Allows switching between Gemini and OpenAI providers
 */

'use client';

import { useState } from 'react';
import type { ProviderType } from '../lib/providers/types';

interface Props {
  value: ProviderType;
  onChange: (provider: ProviderType) => void;
  disabled?: boolean;
  showLabel?: boolean;
}

export default function ProviderSelector({ value, onChange, disabled, showLabel = true }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const providers: Array<{ value: ProviderType; label: string; icon: string }> = [
    { value: 'gemini', label: 'Nano Banana', icon: '🍌' },
    { value: 'openai', label: 'OpenAI Image', icon: '🤖' },
    { value: 'pudding-openai', label: 'Pudding (OpenAI)', icon: '🤖' },
    { value: 'ithink-openai', label: 'iThink (OpenAI)', icon: '🤖' },
    { value: 'grsai', label: 'GrsAI (OpenAI)', icon: '🤖' },
    { value: 'uocode-openai', label: 'Uocode (OpenAI)', icon: '🤖' },
  ];

  const selected = providers.find(p => p.value === value) || providers[0];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {showLabel && (
        <label
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--studio-text-sec)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Provider
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--studio-border)',
          background: disabled ? 'var(--studio-surface)' : 'var(--studio-elevated)',
          color: 'var(--studio-text)',
          fontSize: 12,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{selected.icon}</span>
          <span>{selected.label}</span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--studio-text-muted)' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
            }}
          />

          {/* Dropdown */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 1000,
              background: 'var(--studio-elevated)',
              border: '1px solid var(--studio-border)',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            {providers.map((provider) => (
              <button
                key={provider.value}
                type="button"
                onClick={() => {
                  onChange(provider.value);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  border: 'none',
                  background: provider.value === value
                    ? 'color-mix(in srgb, var(--studio-accent) 12%, transparent)'
                    : 'transparent',
                  color: provider.value === value
                    ? 'var(--studio-accent)'
                    : 'var(--studio-text)',
                  fontSize: 12,
                  fontWeight: provider.value === value ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (provider.value !== value) {
                    e.currentTarget.style.background = 'var(--studio-surface)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (provider.value !== value) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span>{provider.icon}</span>
                <span>{provider.label}</span>
                {provider.value === value && (
                  <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
