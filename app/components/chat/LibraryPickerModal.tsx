'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ImageOff, Loader2, Search, X } from 'lucide-react';

export interface AssetRecord {
  id: string;
  name: string;
  url: string;
  tags: string[];
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (assets: AssetRecord[]) => void;
}

export default function LibraryPickerModal({ open, onClose, onPick }: Props) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [tag, setTag] = useState<string>('all');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    fetch('/api/assets')
      .then(r => r.json())
      .then((data: AssetRecord[]) => {
        setAssets(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allTags = Array.from(new Set(assets.flatMap(a => a.tags))).sort();
  const filtered = assets.filter(a => {
    if (tag !== 'all' && !a.tags.includes(tag)) return false;
    if (filter && !a.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const confirm = () => {
    if (selected.size === 0) return;
    onPick(filtered.filter(a => selected.has(a.id)));
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100]"
            style={{ background: 'rgba(0,0,0,0.55)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col w-full max-w-2xl rounded-xl overflow-hidden"
              style={{
                background: 'var(--studio-surface)',
                border: '1px solid var(--studio-border)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                maxHeight: '80vh',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--studio-border)' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--studio-text)' }}>
                  Pick from Library
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--studio-text-muted)',
                    cursor: 'pointer',
                  }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--studio-border)' }}>
                <div
                  className="flex items-center gap-1.5 flex-1 rounded-md px-2 py-1.5"
                  style={{
                    background: 'var(--studio-bg)',
                    border: '1px solid var(--studio-border)',
                  }}
                >
                  <Search size={12} style={{ color: 'var(--studio-text-muted)' }} />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search by name…"
                    className="flex-1 outline-none"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--studio-text)',
                      fontSize: 11,
                    }}
                  />
                </div>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  style={{
                    background: 'var(--studio-bg)',
                    border: '1px solid var(--studio-border)',
                    color: 'var(--studio-text)',
                    fontSize: 11,
                    padding: '6px 8px',
                    borderRadius: 6,
                    outline: 'none',
                  }}
                >
                  <option value="all">All tags</option>
                  {allTags.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--studio-text-muted)', fontSize: 11 }}>
                    <Loader2 size={12} className="animate-spin" /> Loading library…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8" style={{ color: 'var(--studio-text-muted)', fontSize: 11 }}>
                    <ImageOff size={20} />
                    No assets found.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {filtered.map(asset => {
                      const isSel = selected.has(asset.id);
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => toggle(asset.id)}
                          style={{
                            position: 'relative',
                            border: `2px solid ${isSel ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                            borderRadius: 8,
                            background: isSel
                              ? 'color-mix(in srgb, var(--studio-accent) 12%, transparent)'
                              : 'var(--studio-bg)',
                            cursor: 'pointer',
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
                              overflow: 'hidden',
                            }}
                          >
                            <img
                              src={asset.url}
                              alt={asset.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                          <div
                            style={{
                              padding: '4px 6px',
                              fontSize: 10,
                              fontWeight: 600,
                              color: 'var(--studio-text-sec)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {asset.name}
                          </div>
                          {asset.tags.length > 0 && (
                            <div
                              style={{
                                padding: '0 6px 5px',
                                fontSize: 9,
                                color: 'var(--studio-text-muted)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {asset.tags.slice(0, 3).join(', ')}
                            </div>
                          )}
                          {isSel && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                background: 'var(--studio-accent)',
                                borderRadius: '50%',
                                width: 18,
                                height: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Check size={11} color="white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: '1px solid var(--studio-border)' }}
              >
                <div style={{ fontSize: 11, color: 'var(--studio-text-muted)' }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Pick one or more assets'}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: '1px solid var(--studio-border)',
                      background: 'transparent',
                      color: 'var(--studio-text-sec)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={selected.size === 0}
                    style={{
                      padding: '6px 14px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: '1px solid var(--studio-accent)',
                      background: selected.size === 0
                        ? 'var(--studio-bg)'
                        : 'var(--studio-accent)',
                      color: selected.size === 0 ? 'var(--studio-text-muted)' : '#fff',
                      cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                      opacity: selected.size === 0 ? 0.6 : 1,
                    }}
                  >
                    Attach{selected.size > 0 ? ` (${selected.size})` : ''}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
