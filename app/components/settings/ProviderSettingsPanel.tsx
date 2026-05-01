/**
 * Global Provider Settings Panel
 * Allows users to set default provider for new nodes
 */

'use client';

import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import ProviderSelector from '../ProviderSelector';
import { useProviderSettings } from '../../lib/providerSettingsStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProviderSettingsPanel({ open, onClose }: Props) {
  const { globalProvider, setGlobalProvider } = useProviderSettings();
  const [tempProvider, setTempProvider] = useState(globalProvider);

  if (!open) return null;

  const handleSave = () => {
    setGlobalProvider(tempProvider);
    onClose();
  };

  const handleCancel = () => {
    setTempProvider(globalProvider);
    onClose();
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
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '90vw',
          background: 'var(--studio-elevated)',
          border: '1px solid var(--studio-border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--studio-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings size={20} color="var(--studio-accent)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--studio-text)', margin: 0 }}>
              Provider Settings
            </h2>
          </div>
          <button
            onClick={handleCancel}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid var(--studio-border)',
              background: 'var(--studio-surface)',
              color: 'var(--studio-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--studio-text)', marginBottom: 8 }}>
              Default Provider
            </h3>
            <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5, marginBottom: 16 }}>
              Choose the default image generation provider for new nodes. You can override this per-node.
            </p>
            <ProviderSelector value={tempProvider} onChange={setTempProvider} showLabel={false} />
          </div>

          {/* Provider Info */}
          <div
            style={{
              background: 'var(--studio-surface)',
              border: '1px solid var(--studio-border)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <h4
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--studio-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 10,
              }}
            >
              {tempProvider === 'gemini' ? '🍌 Nano Banana (Gemini)' : '🤖 GPT-Image-2 (OpenAI)'}
            </h4>
            {tempProvider === 'gemini' ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5, marginBottom: 8 }}>
                  <strong>Best for:</strong> Fast iteration, photorealistic rendering, reference-based generation
                </p>
                <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5, marginBottom: 8 }}>
                  <strong>Cost:</strong> ~$0.03-$0.15 per image
                </p>
                <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5 }}>
                  <strong>Max resolution:</strong> 1024×1024
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5, marginBottom: 8 }}>
                  <strong>Best for:</strong> High-quality finals, 2K resolution, transparent backgrounds, batch generation
                </p>
                <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5, marginBottom: 8 }}>
                  <strong>Cost:</strong> $0.006-$0.211 per image (quality-dependent)
                </p>
                <p style={{ fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5 }}>
                  <strong>Max resolution:</strong> 2560×1440 (2K)
                </p>
              </>
            )}
          </div>

          {/* Note */}
          <div
            style={{
              background: 'color-mix(in srgb, var(--studio-accent) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--studio-accent) 20%, transparent)',
              borderRadius: 6,
              padding: 12,
            }}
          >
            <p style={{ fontSize: 11, color: 'var(--studio-text-sec)', lineHeight: 1.5, margin: 0 }}>
              <strong>Note:</strong> Changing the global provider only affects new nodes. Existing nodes keep their
              current provider unless you use the migration tool.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            padding: '16px 24px',
            borderTop: '1px solid var(--studio-border)',
          }}
        >
          <button
            onClick={handleCancel}
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
            onClick={handleSave}
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
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
