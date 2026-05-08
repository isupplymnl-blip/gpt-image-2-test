'use client';

import type { ProviderType } from '../../lib/providers/types';
import { migrateCanvas } from '../../lib/canvasMigration';
import type { Node } from 'reactflow';
import { useState } from 'react';

export type MigrationStrategy = 'keep' | 'convert' | 'fresh';

interface Props {
  open: boolean;
  fromProvider: ProviderType;
  toProvider: ProviderType;
  nodes: Node[];
  onConfirm: (strategy: MigrationStrategy, migratedNodes: Node[]) => void;
  onCancel: () => void;
}

const PROVIDER_LABEL: Record<ProviderType, string> = {
  gemini: 'iSupply AI Studio (Gemini)',
  openai: 'GPT-Image-2 (OpenAI)',
  ecco: 'EccoAPI (iSupply AI Studio)',
  pudding: 'Pudding (Gemini proxy)',
  'pudding-openai': 'Pudding OpenAI proxy',
  'ithink-openai': 'iThink OpenAI proxy',
  grsai: 'GrsAI OpenAI proxy',
};

const OPTIONS: Array<{
  id: MigrationStrategy;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'keep',
    label: 'Keep current nodes',
    description:
      'Leave all canvas nodes as-is. Settings stay on the original provider — nodes may not generate correctly until you update them manually.',
    icon: '🔒',
  },
  {
    id: 'convert',
    label: 'Convert settings',
    description:
      'Translate all node settings to the new provider using settingsMapper. Temperature ↔ quality, resolution ↔ size, etc. Nodes stay on the canvas.',
    icon: '🔄',
  },
  {
    id: 'fresh',
    label: 'Start fresh canvas',
    description:
      'Clear all existing nodes and start with an empty canvas for the new provider. Generated images are preserved in the batch library.',
    icon: '✨',
  },
];

export default function CanvasMigrationModal({
  open,
  fromProvider,
  toProvider,
  nodes,
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<MigrationStrategy>('keep');

  if (!open) return null;

  const handleApply = () => {
    if (selected === 'fresh') {
      onConfirm('fresh', []);
      return;
    }

    if (selected === 'convert') {
      const mapped = migrateCanvas(
        nodes as Array<{ id: string; data: { settings?: Record<string, unknown>; provider?: ProviderType } }>,
        'migrate',
        toProvider,
      ) as unknown as Node[];
      onConfirm('convert', mapped);
      return;
    }

    onConfirm('keep', nodes);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '92vw',
          background: 'var(--studio-elevated)',
          border: '1px solid var(--studio-border)',
          borderRadius: 14,
          padding: 28,
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--studio-text)',
              margin: '0 0 8px',
            }}
          >
            Switch provider?
          </h2>
          <p
            style={{
              fontSize: 12,
              color: 'var(--studio-text-sec)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            You&apos;re switching from{' '}
            <strong style={{ color: 'var(--studio-text)' }}>
              {PROVIDER_LABEL[fromProvider]}
            </strong>{' '}
            to{' '}
            <strong style={{ color: 'var(--studio-text)' }}>
              {PROVIDER_LABEL[toProvider]}
            </strong>
            . You have{' '}
            <strong style={{ color: 'var(--studio-accent)' }}>
              {nodes.length} node{nodes.length !== 1 ? 's' : ''}
            </strong>{' '}
            on the canvas. Choose how to handle them:
          </p>
        </div>

        {/* Option cards */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}
        >
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 9,
                  border: `2px solid ${isSelected ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                  background: isSelected
                    ? 'color-mix(in srgb, var(--studio-accent) 10%, transparent)'
                    : 'var(--studio-surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor =
                      'color-mix(in srgb, var(--studio-accent) 50%, transparent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--studio-border)';
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 5,
                  }}
                >
                  {/* Radio indicator */}
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                      background: isSelected ? 'var(--studio-accent)' : 'transparent',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#fff',
                        }}
                      />
                    )}
                  </div>
                  <span style={{ fontSize: 13 }}>{opt.icon}</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected
                        ? 'var(--studio-accent)'
                        : 'var(--studio-text)',
                    }}
                  >
                    {opt.label}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--studio-text-sec)',
                    lineHeight: 1.55,
                    margin: '0 0 0 26px',
                  }}
                >
                  {opt.description}
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
              padding: '9px 20px',
              borderRadius: 7,
              border: '1px solid var(--studio-border)',
              background: 'var(--studio-surface)',
              color: 'var(--studio-text-sec)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '9px 22px',
              borderRadius: 7,
              border: 'none',
              background: 'linear-gradient(135deg, #7C3AED, #0D9488)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {selected === 'fresh' ? 'Clear & Switch' : 'Apply & Switch'}
          </button>
        </div>
      </div>
    </div>
  );
}
