'use client';

import { useEffect, useState } from 'react';
import { Check, ImageOff, Loader2 } from 'lucide-react';
import type { AssetPickerConfig } from '../../lib/structuredResponse';

interface AssetRecord {
  id: string;
  name: string;
  url: string;
  tags: string[];
  createdAt: string;
}

interface Props {
  config: AssetPickerConfig;
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

export default function AssetPicker({ config, onSubmit, disabled }: Props) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/assets')
      .then(r => r.json())
      .then((data: AssetRecord[]) => {
        const filter = config.filter?.toLowerCase();
        const filtered =
          !filter || filter === 'all'
            ? data
            : data.filter(a => a.tags.some(t => t.toLowerCase().includes(filter)));
        setAssets(filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [config.filter]);

  const toggle = (id: string) => {
    if (disabled) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (config.multi) {
        next.has(id) ? next.delete(id) : next.add(id);
      } else {
        next.clear();
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0 || disabled) return;
    const chosen = assets.filter(a => selected.has(a.id));
    const msg =
      chosen.length === 1
        ? `Using "${chosen[0].name}" — ${chosen[0].url}`
        : `Using: ${chosen.map(a => `"${a.name}" (${a.url})`).join(', ')}`;
    onSubmit(msg);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--studio-text)',
          marginBottom: 8,
        }}
      >
        {config.title}
      </div>

      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--studio-text-muted)',
            fontSize: 11,
          }}
        >
          <Loader2 size={12} className="animate-spin" />
          Loading assets…
        </div>
      ) : assets.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--studio-text-muted)',
            fontSize: 11,
            padding: '12px 0',
          }}
        >
          <ImageOff size={14} />
          No assets found{config.filter && config.filter !== 'all' ? ` (filter: ${config.filter})` : ''}.
        </div>
      ) : (
        <div
          style={{
            maxHeight: 260,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
            gap: 6,
            paddingRight: 4,
          }}
        >
          {assets.map(asset => {
            const isSelected = selected.has(asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => toggle(asset.id)}
                disabled={disabled}
                style={{
                  position: 'relative',
                  border: `2px solid ${isSelected ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                  borderRadius: 8,
                  background: isSelected
                    ? 'color-mix(in srgb, var(--studio-accent) 12%, transparent)'
                    : 'var(--studio-surface)',
                  cursor: disabled ? 'default' : 'pointer',
                  padding: 0,
                  overflow: 'hidden',
                  textAlign: 'left',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    background: 'var(--studio-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={asset.url}
                    alt={asset.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div
                  style={{
                    padding: '4px 5px',
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--studio-text-sec)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.3,
                  }}
                >
                  {asset.name}
                </div>
                {asset.tags.length > 0 && (
                  <div
                    style={{
                      padding: '0 5px 4px',
                      fontSize: 8,
                      color: 'var(--studio-text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {asset.tags.slice(0, 3).join(', ')}
                  </div>
                )}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'var(--studio-accent)',
                      borderRadius: '50%',
                      width: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={9} color="white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!loading && assets.length > 0 && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || selected.size === 0}
          style={{
            marginTop: 10,
            padding: '6px 14px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid var(--studio-accent)',
            background:
              selected.size === 0
                ? 'var(--studio-surface)'
                : 'color-mix(in srgb, var(--studio-accent) 20%, transparent)',
            color: selected.size === 0 ? 'var(--studio-text-muted)' : 'var(--studio-text)',
            cursor: disabled || selected.size === 0 ? 'default' : 'pointer',
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          {config.submit_label ?? 'Use selected'}
          {selected.size > 0 && ` (${selected.size})`}
        </button>
      )}
    </div>
  );
}
