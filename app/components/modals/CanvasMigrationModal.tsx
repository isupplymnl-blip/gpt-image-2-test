/**
 * Canvas Migration Modal
 * Shown when loading a canvas with provider mismatch
 */

'use client';

import { useState } from 'react';
import type { ProviderType } from '../../lib/providers/types';
import { MIGRATION_OPTIONS, type MigrationOption } from '../../lib/canvasMigration';

interface Props {
  open: boolean;
  canvasProvider: ProviderType;
  globalProvider: ProviderType;
  onSelect: (strategy: 'keep' | 'global' | 'migrate') => void;
  onCancel: () => void;
}

export default function CanvasMigrationModal({
  open,
  canvasProvider,
  globalProvider,
  onSelect,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<'keep' | 'global' | 'migrate'>('keep');

  if (!open) return null;

  const canvasLabel = canvasProvider === 'gemini' ? 'Nano Banana (Gemini)' : 'GPT-Image-2 (OpenAI)';
  const globalLabel = globalProvider === 'gemini' ? 'Nano Banana (Gemini)' : 'GPT-Image-2 (OpenAI)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '90vw',
          background: 'var(--studio-elevated)',
          border: '1px solid var(--studio-border)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--studio-text)', marginBottom: 8 }}>
            Provider Mismatch Detected
          </h2>
          <p style={{ fontSize: 13, color: 'var(--studio-text-sec)', lineHeight: 1.5 }}>
            This canvas was created with <strong>{canvasLabel}</strong>, but your current global provider is{' '}
            <strong>{globalLabel}</strong>. How would you like to proceed?
          </p>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {MIGRATION_OPTIONS.map((option) => {
            const isSelected = selected === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setSelected(option.id as 'keep' | 'global' | 'migrate')}
                style={{
                  width: '100%',
                  padding: 16,
                  borderRadius: 8,
                  border: `2px solid ${isSelected ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                  background: isSelected
                    ? 'color-mix(in srgb, var(--studio-accent) 12%, transparent)'
                    : 'var(--studio-surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--studio-accent)';
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--studio-accent) 6%, transparent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--studio-border)';
                    e.currentTarget.style.background = 'var(--studio-surface)';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                      background: isSelected ? 'var(--studio-accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#fff',
                        }}
                      />
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isSelected ? 'var(--studio-accent)' : 'var(--studio-text)',
                    }}
                  >
                    {option.label}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--studio-text-sec)',
                    lineHeight: 1.5,
                    marginLeft: 28,
                  }}
                >
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              borderRadius: 7,
              border: '1px solid var(--studio-border)',
              background: 'var(--studio-surface)',
              color: 'var(--studio-text-sec)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(selected)}
            style={{
              padding: '10px 20px',
              borderRadius: 7,
              border: 'none',
              background: 'linear-gradient(135deg, #7C3AED, #0D9488)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
