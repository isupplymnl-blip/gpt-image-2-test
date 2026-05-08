'use client';

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { StudioContext } from '../../context/StudioContext';
import type { NodeSettings } from '../../context/StudioContext';
import { uploadReferenceImage } from '../../lib/uploadAsset';

interface SettingNodeData {
  label: string;
  isLoading?: boolean;
  imageUrl?: string;
  error?: string;
  settings?: NodeSettings;
}

const ACCENT = '#059669';
const ACCENT_DIM = '#05966933';

// Parses [API:gemini,...] or [API:openai,...] — dispatches by first token / model= value.
// Returns a NodeSettings patch and the cleaned text (tag stripped).
function parseSettingTag(text: string): { patch: Partial<NodeSettings>; cleanText: string } | null {
  const firstLine = text.trimStart().split('\n')[0].trim();
  const m = /^\[API:\s*([^\]]+)\]/i.exec(firstLine);
  if (!m) return null;
  const pairs = m[1];
  const patch: Partial<NodeSettings> = {};

  const isOpenAITag = /\bopenai\b/i.test(pairs) || /\bmodel=gpt-image/i.test(pairs);

  if (isOpenAITag) {
    const modelM    = /model=([^\s,\]]+)/i.exec(pairs);     if (modelM)    patch.model = modelM[1];
    const qualityM  = /quality=([^\s,\]]+)/i.exec(pairs);   if (qualityM)  patch.quality = qualityM[1].toLowerCase() as NodeSettings['quality'];
    const sizeM     = /size=([^\s,\]]+)/i.exec(pairs);      if (sizeM)     patch.size = sizeM[1].replace(/×/g, 'x');
    const formatM   = /format=([^\s,\]]+)/i.exec(pairs);    if (formatM)   patch.output_format = formatM[1].toLowerCase() as NodeSettings['output_format'];
    const bgM       = /background=([^\s,\]]+)/i.exec(pairs); if (bgM)      patch.background = bgM[1].toLowerCase() as NodeSettings['background'];
    const modM      = /moderation=([^\s,\]]+)/i.exec(pairs); if (modM)     patch.moderation = modM[1].toLowerCase() as NodeSettings['moderation'];
    const nM        = /\bn=([0-9]+)/i.exec(pairs);          if (nM)        patch.n = parseInt(nM[1], 10);
    const compressM = /compress=([0-9]+)/i.exec(pairs);     if (compressM) patch.output_compression = parseInt(compressM[1], 10);
  } else {
    // Gemini / Pudding (Gemini family) — settings nodes clamp temp to 0.5–0.7 for plate consistency
    const tempM  = /temp=([0-9.]+)/i.exec(pairs);
    const seedM  = /seed=([0-9]+)/i.exec(pairs);
    const ratioM = /ratio=([^\s,\]]+)/i.exec(pairs);
    if (tempM)  patch.temperature = Math.min(0.7, Math.max(0.5, parseFloat(tempM[1])));
    if (seedM)  patch.seed = parseInt(seedM[1], 10);
    if (ratioM) patch.aspectRatio = ratioM[1];
  }

  if (!Object.keys(patch).length) return null;
  const cleanText = text.replace(/^\[API:[^\]]+\]\s*\n?/i, '');
  return { patch, cleanText };
}

export default function SettingNode({ id, data }: NodeProps<SettingNodeData>) {
  const { onGenerateSetting, onUpdateSettings, onSelectNode, onAddToLibrary, onDeleteNode, activeProvider } = useContext(StudioContext);

  const [text, setText] = useState(() =>
    typeof (data as unknown as Record<string, unknown>).description === 'string'
      ? (data as unknown as Record<string, unknown>).description as string
      : ''
  );
  const [lastText, setLastText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [detectedTag, setDetectedTag] = useState(false);
  const [inputMode, setInputMode] = useState<'generate' | 'upload'>('generate');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedUrl, setUploadedUrl] = useState(data.settings?.uploadedSettingUrl ?? '');
  const [uploadedName, setUploadedName] = useState(data.settings?.uploadedSettingName ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const autoDetectRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tagStrippedRef = useRef(false);

  // Auto-detect [API: temp=X, seed=Y] tag on line 1
  useEffect(() => {
    clearTimeout(autoDetectRef.current);
    autoDetectRef.current = setTimeout(() => {
      if (tagStrippedRef.current) { tagStrippedRef.current = false; return; }
      if (!text.trim()) { setDetectedTag(false); return; }
      const result = parseSettingTag(text);
      if (result) {
        onUpdateSettings(id, result.patch);
        tagStrippedRef.current = true;
        setText(result.cleanText);
        setDetectedTag(true);
      }
    }, 500);
    return () => clearTimeout(autoDetectRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [text]);

  const settings = data.settings ?? {};
  const { isLoading, imageUrl, error } = data;

  const compositeMode = settings.compositeMode ?? 'single';
  const storedAngles  = settings.compositeAngles ?? [];
  const angleCount    = storedAngles.length === 2 ? 2 : storedAngles.length === 3 ? 3 : 4;
  const isComposite   = compositeMode === 'multi-angle';
  const previewRatio  = isComposite && angleCount > 2 ? '21/9' : '16/9';

  const handleUploadFile = useCallback(async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError('');
    const derivedName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    const result = await uploadReferenceImage(file, derivedName, ['setting-plate']);
    if (result.success && result.url) {
      setUploadedUrl(result.url);
      setUploadedName(result.name ?? derivedName);
      onUpdateSettings(id, { uploadedSettingUrl: result.url, uploadedSettingName: result.name ?? derivedName });
    } else {
      setUploadError(result.error ?? 'Upload failed');
    }
    setIsUploading(false);
  }, [id, onUpdateSettings]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUploadFile(file);
  }, [handleUploadFile]);

  const handleGenerate = useCallback(async () => {
    if (!text.trim() || isLoading) return;
    setLastText(text.trim());
    await onGenerateSetting(id, text.trim(), settings);
  }, [text, isLoading, id, settings, onGenerateSetting]);

  const handleRegen = useCallback(async () => {
    if (!lastText || isLoading) return;
    await onGenerateSetting(id, lastText, settings);
  }, [lastText, isLoading, id, settings, onGenerateSetting]);

  const canRegen = Boolean(lastText) && !isLoading;

  return (
    <div
      onClick={() => onSelectNode(id, 'settingNode')}
      style={{
        width: 320,
        background: 'var(--studio-elevated)',
        border: `1px solid ${imageUrl ? ACCENT_DIM : 'var(--studio-border)'}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: imageUrl
          ? `0 0 0 1px ${ACCENT}22, 0 4px 20px rgba(0,0,0,0.4)`
          : '0 4px 20px rgba(0,0,0,0.4)',
        cursor: 'default',
        transition: 'border-color 0.3s',
      }}
    >
      <Handle type="source" position={Position.Right}
        style={{ width: 10, height: 10, background: ACCENT, border: '2px solid var(--studio-elevated)', boxShadow: `0 0 6px ${ACCENT}` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: ACCENT,
          boxShadow: `0 0 5px ${ACCENT}`,
          animation: isLoading ? 'pulse 1s infinite' : 'none',
        }} />
        <span style={{ color: 'var(--studio-text)', fontWeight: 600, fontSize: 12 }}>Setting / BG Plate</span>
        <span style={{ fontSize: 9, color: ACCENT, background: `${ACCENT}18`, padding: '2px 7px', borderRadius: 20, border: `1px solid ${ACCENT}33` }}>
          {isComposite ? 'Multi-angle' : 'Background'}
        </span>

        {/* Collapse */}
        <button
          className="nodrag"
          title={collapsed ? 'Expand' : 'Collapse'}
          onClick={e => { e.stopPropagation(); setCollapsed(v => !v); }}
          style={{
            marginLeft: 'auto',
            width: 20, height: 20, borderRadius: 5,
            border: '1px solid var(--studio-border)', background: 'var(--studio-surface)', color: 'var(--studio-text-muted)',
            cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0,
          }}
        >
          <span className={`collapse-chevron ${collapsed ? 'collapsed' : ''}`}>⌄</span>
        </button>

        {/* Delete */}
        <button
          className="nodrag"
          title="Remove node"
          onClick={e => { e.stopPropagation(); onDeleteNode(id); }}
          style={{
            width: 20, height: 20, borderRadius: 5,
            border: '1px solid var(--studio-border)', background: 'var(--studio-surface)', color: 'var(--studio-text-muted)',
            cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#F43F5E'; e.currentTarget.style.borderColor = '#F43F5E44'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--studio-text-muted)'; e.currentTarget.style.borderColor = 'var(--studio-border)'; }}
        >×</button>
      </div>

      {/* Mode toggle — always visible */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['generate', 'upload'] as const).map(mode => {
          const active = inputMode === mode;
          return (
            <button
              key={mode}
              className="nodrag"
              onClick={e => { e.stopPropagation(); setInputMode(mode); }}
              style={{
                flex: 1, padding: '4px 0', fontSize: 9, borderRadius: 5,
                border: `1px solid ${active ? ACCENT : 'var(--studio-border)'}`,
                background: active ? ACCENT : 'var(--studio-elevated)',
                color: active ? '#fff' : 'var(--studio-text-sec)',
                cursor: 'pointer', fontWeight: active ? 700 : 400,
              }}
            >
              {mode === 'generate' ? 'Generate' : 'Upload existing'}
            </button>
          );
        })}
      </div>

      {collapsed ? (
        <div style={{ fontSize: 11, color: 'var(--studio-text-muted)', fontStyle: 'italic', padding: '4px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {inputMode === 'upload'
            ? (uploadedName ? uploadedName : 'No plate uploaded')
            : (text.trim() ? text.slice(0, 80) + (text.length > 80 ? '…' : '') : 'Empty setting — expand to edit')
          }
        </div>
      ) : inputMode === 'upload' ? (<>
        {/* Drop zone */}
        <div
          className="nodrag"
          onDragOver={e => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
          style={{
            width: '100%', aspectRatio: previewRatio, borderRadius: 7, overflow: 'hidden',
            background: 'var(--studio-surface)', marginBottom: 10, position: 'relative',
            border: `2px dashed ${uploadedUrl ? ACCENT : 'var(--studio-border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {uploadedUrl ? (
            <>
              <img src={uploadedUrl} alt="Uploaded plate" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span style={{
                position: 'absolute', top: 5, left: 5,
                fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                background: ACCENT, color: '#fff',
                padding: '2px 6px', borderRadius: 4,
              }}>PLATE</span>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '0 12px' }}>
              {isUploading ? (
                <p style={{ color: ACCENT, fontSize: 11 }}>Uploading…</p>
              ) : (
                <>
                  <span style={{ fontSize: 24, opacity: 0.3 }}>⬆</span>
                  <p style={{ color: 'var(--studio-text-muted)', fontSize: 11, marginTop: 4 }}>Drop image or click to browse</p>
                </>
              )}
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }}
        />
        {uploadError && (
          <p style={{ fontSize: 10, color: '#F43F5E', marginBottom: 6 }}>{uploadError}</p>
        )}
        {uploadedUrl && (
          <p style={{ fontSize: 9, color: ACCENT, marginBottom: 8, textAlign: 'center' }}>
            Using this plate as background — connect → to a PromptNode
          </p>
        )}
      </>) : (<>
      {/* Setting Block textarea */}
      <label style={{ color: 'var(--studio-text-muted)', fontSize: 10, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Setting Block
      </label>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Golden hour sunlight → tropical beach shoreline → palm fronds foreground / ocean horizon background → warm haze atmosphere → 85mm lens, shallow depth of field`}
        style={{
          width: '100%', background: 'var(--studio-surface)', border: '1px solid var(--studio-border)',
          borderRadius: 7, padding: '6px 9px', color: 'var(--studio-text)', fontSize: 11,
          resize: 'none', outline: 'none', lineHeight: 1.6, marginBottom: 6,
          boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 72, overflow: 'hidden',
        }}
      />

      {/* Quality tail preview */}
      <div style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '4px 8px', marginBottom: 9 }}>
        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', margin: 0 }}>
          Auto-appended: <span style={{ color: ACCENT }}>no people — no products — background plate only — photorealistic</span>
        </p>
      </div>

      {/* Output image (16:9 or 21:9 for composite) */}
      <div style={{
        width: '100%', aspectRatio: previewRatio, borderRadius: 7, overflow: 'hidden',
        background: 'var(--studio-surface)', marginBottom: 10, position: 'relative', border: '1px solid var(--studio-border)',
      }}>
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: '70%', height: 3, borderRadius: 2, background: `linear-gradient(90deg, #1A1A1F 25%, ${ACCENT} 50%, #1A1A1F 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.2s ease-in-out infinite' }} />
            <p style={{ color: 'var(--studio-text-muted)', fontSize: 11 }}>{isComposite ? 'Generating composite…' : 'Generating background plate…'}</p>
          </div>
        )}
        {!isLoading && error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <p style={{ color: '#F43F5E', fontSize: 11, textAlign: 'center', padding: '0 12px' }}>{error}</p>
          </div>
        )}
        {!isLoading && !error && imageUrl && (
          <>
            <img src={imageUrl} alt="Background plate" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <button
              onClick={e => {
                e.stopPropagation();
                const basePrompt = lastText || text;
                const angleTags = isComposite && storedAngles.length > 0
                  ? storedAngles.filter(Boolean).join(' · ')
                  : '';
                const savedPrompt = angleTags ? `${basePrompt} · ${angleTags}` : basePrompt;
                onAddToLibrary({ url: imageUrl, prompt: savedPrompt, nodeId: id, createdAt: new Date().toISOString() });
              }}
              title="Save to Image Library"
              style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 5, border: 'none', background: '#111113cc', color: 'var(--studio-text-sec)', cursor: 'pointer', fontSize: 11 }}
            >⊕</button>
          </>
        )}
        {!isLoading && !error && !imageUrl && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <span style={{ fontSize: 24, opacity: 0.25 }}>🏞</span>
            <p style={{ color: 'var(--studio-text-muted)', fontSize: 11 }}>{isComposite ? 'Composite appears here' : 'Background plate appears here'}</p>
          </div>
        )}
      </div>

      {imageUrl && (
        <p style={{ fontSize: 9, color: ACCENT, marginBottom: 8, textAlign: 'center' }}>
          Connect → to a PromptNode to use as reference
        </p>
      )}

      {detectedTag && (
        <div style={{ marginBottom: 7, padding: '4px 8px', borderRadius: 6, background: `${ACCENT}11`, border: `1px solid ${ACCENT}33`, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: ACCENT }}>⚡ API tag detected — temp + seed applied</span>
        </div>
      )}

      {/* EccoAPI inline controls */}
      {activeProvider === 'ecco' && (
        <div style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)', borderRadius: 7, padding: '7px 9px', marginBottom: 9 }}>
          <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EccoAPI Settings</p>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {(['nanobanana31', 'nanobananapro'] as const).map(m => {
              const active = (data.settings?.eccoModel ?? 'nanobananapro') === m;
              return (
                <button key={m} className="nodrag" onClick={e => { e.stopPropagation(); onUpdateSettings(id, { eccoModel: m }); }}
                  style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 5, border: `1px solid ${active ? ACCENT : 'var(--studio-border)'}`, background: active ? ACCENT : 'var(--studio-elevated)', color: active ? '#fff' : 'var(--studio-text-sec)', cursor: 'pointer' }}>
                  {m === 'nanobanana31' ? 'NB 3.1' : 'NB Pro'}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1K', '2K', '4K'] as const).map(s => {
              const active = (data.settings?.imageSize ?? '1K') === s;
              return (
                <button key={s} className="nodrag" onClick={e => { e.stopPropagation(); onUpdateSettings(id, { imageSize: s }); }}
                  style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 5, border: `1px solid ${active ? ACCENT : 'var(--studio-border)'}`, background: active ? ACCENT : 'var(--studio-elevated)', color: active ? '#fff' : 'var(--studio-text-sec)', cursor: 'pointer' }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* OpenAI inline controls */}
      {(activeProvider === 'openai' || activeProvider === 'pudding-openai' || activeProvider === 'ithink-openai' || activeProvider === 'grsai') && (
        <div style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)', borderRadius: 7, padding: '7px 9px', marginBottom: 9 }}>
          <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{activeProvider === 'pudding-openai' ? 'Pudding OpenAI' : activeProvider === 'ithink-openai' ? 'iThink OpenAI' : activeProvider === 'grsai' ? 'GrsAI OpenAI' : 'OpenAI'}</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1K', '2K', '4K'] as const).map(s => {
              const active = (data.settings?.imageSize ?? '1K') === s;
              return (
                <button key={s} className="nodrag" onClick={e => { e.stopPropagation(); onUpdateSettings(id, { imageSize: s }); }}
                  style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 5, border: `1px solid ${active ? '#10B981' : 'var(--studio-border)'}`, background: active ? '#10B981' : 'var(--studio-elevated)', color: active ? '#fff' : 'var(--studio-text-sec)', cursor: 'pointer' }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Gemini inline model selector */}
      {activeProvider === 'gemini' && (
        <div style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)', borderRadius: 7, padding: '7px 9px', marginBottom: 9 }}>
          <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gemini Model</p>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            {(['Flash', 'Pro', 'Standard'] as const).map(m => {
              const active = (data.settings?.model ?? 'Flash') === m;
              return (
                <button key={m} className="nodrag" onClick={e => { e.stopPropagation(); onUpdateSettings(id, { model: m }); }}
                  style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 5, border: `1px solid ${active ? '#0D9488' : 'var(--studio-border)'}`, background: active ? '#0D9488' : 'var(--studio-elevated)', color: active ? '#fff' : 'var(--studio-text-sec)', cursor: 'pointer' }}>
                  {m}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1K', '2K', '4K'] as const).map(s => {
              const active = (data.settings?.imageSize ?? '1K') === s;
              return (
                <button key={s} className="nodrag" onClick={e => { e.stopPropagation(); onUpdateSettings(id, { imageSize: s }); }}
                  style={{ flex: 1, padding: '3px 0', fontSize: 9, borderRadius: 5, border: `1px solid ${active ? '#0D9488' : 'var(--studio-border)'}`, background: active ? '#0D9488' : 'var(--studio-elevated)', color: active ? '#fff' : 'var(--studio-text-sec)', cursor: 'pointer' }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          className="nodrag"
          onClick={e => { e.stopPropagation(); handleRegen(); }}
          disabled={!canRegen}
          style={{
            flex: canRegen && error ? 2 : 1,
            padding: '8px', borderRadius: 7,
            border: `1px solid ${error && canRegen ? '#F43F5E44' : 'var(--studio-border)'}`,
            background: 'var(--studio-surface)',
            color: !canRegen ? 'var(--studio-text-muted)' : error ? '#F43F5E' : 'var(--studio-text-sec)',
            cursor: !canRegen ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600,
          }}
        >
          ↻ Regen
        </button>
        <button
          className="nodrag"
          onClick={e => { e.stopPropagation(); handleGenerate(); }}
          disabled={!text.trim() || Boolean(isLoading)}
          style={{
            flex: error && canRegen ? 1 : 2,
            padding: '8px', borderRadius: 7, border: 'none',
            cursor: !text.trim() || isLoading ? 'not-allowed' : 'pointer',
            background: !text.trim() || isLoading ? 'var(--studio-border)' : `linear-gradient(135deg, ${ACCENT}, #0D9488)`,
            color: !text.trim() || isLoading ? 'var(--studio-text-muted)' : '#fff',
            fontSize: 11, fontWeight: 700,
          }}
        >
          {isLoading ? 'Generating…' : isComposite ? '✦ Generate Composite' : '✦ Generate Plate'}
        </button>
      </div>
      </>)}
    </div>
  );
}
