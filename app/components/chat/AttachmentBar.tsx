'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, Package, Sparkles, Plus, User, Image as ImageIcon, FileUp, Loader2, Library } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ImageAttachment, BrandDna } from '../../lib/chatStore';
import { uid } from '../../lib/chatStore';
import { fmtBytes, isImage, isTextLike, readImageBase64, readText, IMAGE_ACCEPT, ANY_FILE_ACCEPT } from '../../lib/chatFiles';
import DirectorBlockActions, { type BuildRequest } from './DirectorBlockActions';
import type { DetectedBlock } from '../../lib/directorParser';
import LibraryPickerModal, { type AssetRecord } from './LibraryPickerModal';

export interface ConvertingFile { id: string; name: string; kind: 'product' | 'style' | 'model' | 'file' }

interface Props {
  brandDna: BrandDna | null;
  pendingImages: ImageAttachment[];
  convertingFiles?: ConvertingFile[];
  onSetBrandDna: (b: BrandDna | null) => void;
  onAddImage: (img: ImageAttachment) => void;
  onRemoveImage: (id: string) => void;
  onAddConverting?: (f: ConvertingFile) => void;
  onRemoveConverting?: (id: string) => void;
  buildBlocks?: DetectedBlock[];
  onBuildNode?: (req: BuildRequest) => Promise<string | null>;
  buildDisabled?: boolean;
}

export default function AttachmentBar({
  brandDna,
  pendingImages,
  convertingFiles = [],
  onSetBrandDna,
  onAddImage,
  onRemoveImage,
  onAddConverting,
  onRemoveConverting,
  buildBlocks = [],
  onBuildNode,
  buildDisabled,
}: Props) {
  const brandRef = useRef<HTMLInputElement>(null);
  const productRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleLibraryPick = (assets: AssetRecord[]) => {
    for (const asset of assets) {
      // URL-only attachment — server hydrates from disk on send. Skip auto-resave (already in lib).
      const tagKind = asset.tags.find(t => ['product', 'style', 'model'].includes(t)) as 'product' | 'style' | 'model' | undefined;
      onAddImage({
        id: uid(),
        kind: tagKind ?? 'style',
        name: asset.name,
        mime: 'image/jpeg',
        data: '',
        size: 0,
        url: asset.url,
      });
    }
  };

  const handleBrand = async (f: File | undefined) => {
    if (!f) return;
    if (!isTextLike(f)) {
      alert('Upload a text file (md, txt, json, yaml, etc.)');
      return;
    }
    const content = await readText(f);
    onSetBrandDna({ name: f.name, content, size: f.size });
  };

  const handleImages = async (files: FileList | null, kind: 'product' | 'style' | 'model') => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
      if (!isImage(f)) {
        alert(`Skipped ${f.name}: not a supported image format`);
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        alert(`Skipped ${f.name}: > 15 MB`);
        continue;
      }
      const cid = uid();
      onAddConverting?.({ id: cid, name: f.name, kind });
      try {
        const { data, mime } = await readImageBase64(f);
        onAddImage({ id: uid(), kind, name: f.name.replace(/\.(heic|heif)$/i, '.png'), mime, data, size: f.size });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`Failed to load ${f.name}: ${msg}`);
      } finally {
        onRemoveConverting?.(cid);
      }
    }
  };

  // Generic "any file" handler — auto-routes by type
  const handleAnyFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
      if (isImage(f)) {
        if (f.size > 15 * 1024 * 1024) { alert(`Skipped ${f.name}: > 15 MB`); continue; }
        const cid = uid();
        onAddConverting?.({ id: cid, name: f.name, kind: 'style' });
        try {
          const { data, mime } = await readImageBase64(f);
          onAddImage({ id: uid(), kind: 'style', name: f.name.replace(/\.(heic|heif)$/i, '.png'), mime, data, size: f.size });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          alert(`Failed to load ${f.name}: ${msg}`);
        } finally {
          onRemoveConverting?.(cid);
        }
      } else if (isTextLike(f)) {
        if (f.size > 5 * 1024 * 1024) { alert(`Skipped ${f.name}: > 5 MB`); continue; }
        const content = await readText(f);
        onSetBrandDna({ name: f.name, content, size: f.size });
      } else {
        if (f.size > 15 * 1024 * 1024) { alert(`Skipped ${f.name}: > 15 MB`); continue; }
        const cid = uid();
        onAddConverting?.({ id: cid, name: f.name, kind: 'file' });
        try {
          const { data, mime } = await readImageBase64(f);
          onAddImage({ id: uid(), kind: 'file', name: f.name, mime: mime || 'application/octet-stream', data, size: f.size });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          alert(`Failed to load ${f.name}: ${msg}`);
        } finally {
          onRemoveConverting?.(cid);
        }
      }
    }
  };

  const hasAny = brandDna || pendingImages.length > 0 || convertingFiles.length > 0;

  return (
    <div className="w-full px-3">
      <AnimatePresence>
        {hasAny && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-wrap gap-2 overflow-hidden pb-2"
          >
            {brandDna && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="group flex items-center gap-2 rounded-lg px-3 py-1.5"
                style={{
                  border: '1px solid color-mix(in srgb, var(--studio-accent) 45%, transparent)',
                  background: 'color-mix(in srgb, var(--studio-accent) 15%, transparent)',
                  fontSize: 12,
                }}
              >
                <FileText size={12} style={{ color: 'var(--studio-accent)' }} />
                <div className="flex flex-col leading-tight">
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--studio-accent)',
                    }}
                  >
                    Brand DNA
                  </span>
                  <span style={{ color: 'var(--studio-text)', fontSize: 11 }}>
                    {brandDna.name} · {fmtBytes(brandDna.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSetBrandDna(null)}
                  className="ml-1"
                  style={{ background: 'transparent', border: 'none', color: 'var(--studio-text-muted)', cursor: 'pointer' }}
                  aria-label="Remove brand DNA"
                >
                  <X size={12} />
                </button>
              </motion.div>
            )}

            {pendingImages.map((img) => (
              <motion.div
                key={img.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="group relative flex items-center gap-2 rounded-lg py-1 pl-1 pr-2"
                style={{
                  border: '1px solid var(--studio-border)',
                  background: 'var(--studio-elevated)',
                  fontSize: 12,
                }}
              >
                <img
                  src={img.data ? `data:${img.mime};base64,${img.data}` : (img.url ?? '')}
                  alt={img.name}
                  className="h-8 w-8 rounded-md object-cover"
                />
                <div className="flex flex-col leading-tight">
                  <span
                    className="flex items-center gap-1"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color:
                        img.kind === 'product' ? '#10B981' :
                        img.kind === 'model'   ? '#F59E0B' :
                        img.kind === 'file'    ? '#94A3B8' :
                                                 '#818CF8',
                    }}
                  >
                    {img.kind === 'product' ? <Package size={10} /> :
                     img.kind === 'model'   ? <User size={10} /> :
                     img.kind === 'file'    ? <FileUp size={10} /> :
                                              <Sparkles size={10} />}
                    {img.kind}
                  </span>
                  <span
                    className="max-w-[140px] truncate"
                    style={{ color: 'var(--studio-text)', fontSize: 11 }}
                  >
                    {img.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveImage(img.id)}
                  className="ml-0.5"
                  style={{ background: 'transparent', border: 'none', color: 'var(--studio-text-muted)', cursor: 'pointer' }}
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ))}

            {convertingFiles.map((cf) => (
              <motion.div
                key={cf.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="group relative flex items-center gap-2 rounded-lg py-1 pl-1 pr-2"
                style={{
                  border: '1px dashed color-mix(in srgb, var(--studio-accent) 55%, transparent)',
                  background: 'color-mix(in srgb, var(--studio-accent) 8%, var(--studio-elevated))',
                  fontSize: 12,
                }}
              >
                <div
                  className="h-8 w-8 rounded-md flex items-center justify-center"
                  style={{ background: 'var(--studio-surface)' }}
                >
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--studio-accent)' }} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span
                    className="flex items-center gap-1"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--studio-accent)',
                    }}
                  >
                    Converting
                  </span>
                  <span
                    className="max-w-[140px] truncate"
                    style={{ color: 'var(--studio-text-sec)', fontSize: 11 }}
                  >
                    {cf.name}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
            style={{
              border: '1px dashed var(--studio-border)',
              background: 'var(--studio-surface)',
              color: 'var(--studio-text-sec)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--studio-accent) 45%, transparent)';
              e.currentTarget.style.background = 'color-mix(in srgb, var(--studio-accent) 10%, transparent)';
              e.currentTarget.style.color = 'var(--studio-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--studio-border)';
              e.currentTarget.style.background = 'var(--studio-surface)';
              e.currentTarget.style.color = 'var(--studio-text-sec)';
            }}
            aria-label="Attach"
            aria-expanded={menuOpen}
          >
            <Plus size={12} />
            <span style={{ fontWeight: 600 }}>Attach</span>
          </motion.button>

          {buildBlocks.length > 0 && onBuildNode && (
            <DirectorBlockActions
              blocks={buildBlocks}
              onCreate={onBuildNode}
              disabled={buildDisabled}
            />
          )}
        </div>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-[5]"
                onClick={() => setMenuOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full mb-2 left-0 z-10 flex flex-col overflow-hidden"
                style={{
                  width: 220,
                  background: 'var(--studio-surface)',
                  border: '1px solid var(--studio-border)',
                  borderRadius: 8,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
                }}
              >
                <MenuItem
                  icon={FileText}
                  label={brandDna ? 'Replace Brand DNA' : 'Brand DNA'}
                  hint="text file"
                  onClick={() => {
                    setMenuOpen(false);
                    brandRef.current?.click();
                  }}
                />
                <MenuItem
                  icon={Package}
                  label="Product Ref"
                  hint="product image"
                  onClick={() => {
                    setMenuOpen(false);
                    productRef.current?.click();
                  }}
                />
                <MenuItem
                  icon={User}
                  label="Model Ref"
                  hint="model image"
                  onClick={() => {
                    setMenuOpen(false);
                    modelRef.current?.click();
                  }}
                />
                <MenuItem
                  icon={Sparkles}
                  label="Style Ref"
                  hint="mood image"
                  onClick={() => {
                    setMenuOpen(false);
                    styleRef.current?.click();
                  }}
                />
                <MenuItem
                  icon={ImageIcon}
                  label="Upload Image"
                  hint="any image"
                  onClick={() => {
                    setMenuOpen(false);
                    imageRef.current?.click();
                  }}
                />
                <MenuItem
                  icon={Library}
                  label="Upload from Library"
                  hint="pick saved asset"
                  onClick={() => {
                    setMenuOpen(false);
                    setLibraryOpen(true);
                  }}
                />
                <MenuItem
                  icon={FileUp}
                  label="Upload Files"
                  hint="any file"
                  onClick={() => {
                    setMenuOpen(false);
                    fileRef.current?.click();
                  }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <input
          ref={brandRef}
          type="file"
          accept=".md,.txt,.json,.yaml,.yml,.csv,.log,.html,.xml,.ts,.tsx,.js,.jsx,.py,text/*"
          className="hidden"
          onChange={(e) => {
            handleBrand(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={productRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleImages(e.target.files, 'product');
            e.target.value = '';
          }}
        />
        <input
          ref={styleRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleImages(e.target.files, 'style');
            e.target.value = '';
          }}
        />
        <input
          ref={modelRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleImages(e.target.files, 'model');
            e.target.value = '';
          }}
        />
        <input
          ref={imageRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleImages(e.target.files, 'style');
            e.target.value = '';
          }}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ANY_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleAnyFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <LibraryPickerModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={handleLibraryPick}
      />
    </div>
  );
}

interface MenuItemProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  hint: string;
  onClick: () => void;
}

function MenuItem({ icon: Icon, label, hint, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left"
      style={{
        background: 'transparent',
        border: 'none',
        color: 'var(--studio-text-sec)',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--studio-elevated)';
        e.currentTarget.style.color = 'var(--studio-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--studio-text-sec)';
      }}
    >
      <Icon size={13} />
      <span style={{ fontWeight: 600, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10, color: 'var(--studio-text-muted)' }}>{hint}</span>
    </button>
  );
}
