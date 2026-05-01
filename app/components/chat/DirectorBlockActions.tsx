'use client';

import { useState } from 'react';
import { Check, Loader2, User, MapPin, FileText, Images, ImagePlus } from 'lucide-react';
import type { DetectedBlock } from '../../lib/directorParser';

export interface BuildRequest {
  kind: DetectedBlock['kind'];
  heading: string;
  body: string;
  slides?: string[];
  imageData?: string;
  imageName?: string;
  imageTags?: string[];
  apiConfig?: {
    model?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    seed?: number;
    quality?: 'low' | 'medium' | 'high';
    size?: string;
    output_format?: 'png' | 'jpeg' | 'webp';
    background?: 'auto' | 'opaque' | 'transparent';
    n?: number;
  };
}

interface Props {
  blocks: DetectedBlock[];
  onCreate: (req: BuildRequest) => Promise<string | null>;
  disabled?: boolean;
}

const ICON: Record<DetectedBlock['kind'], React.ComponentType<{ size?: number }>> = {
  model: User,
  setting: MapPin,
  prompt: FileText,
  carousel: Images,
  image_reference: ImagePlus,
};

function extractHint(b: DetectedBlock, keywords: string[]): string {
  const sources = [b.heading, b.body.split('\n')[0] ?? '', b.body.split('\n')[1] ?? ''].join(' ').toLowerCase();
  const found = keywords.find(k => sources.includes(k));
  if (found) return found.charAt(0).toUpperCase() + found.slice(1);
  // Fallback: first 3 words of heading after emoji/hashes
  const clean = b.heading.replace(/^[#\s🧍🏖️🎬📦]+/, '').replace(/block/i, '').trim();
  const words = clean.split(/\s+/).slice(0, 3).join(' ');
  return words || '';
}

const LABEL: Record<DetectedBlock['kind'], (b: DetectedBlock) => string> = {
  model: (b) => {
    const hint = extractHint(b, ['female', 'male', 'non-binary', 'woman', 'man', 'model', 'person']);
    return hint ? `Model Node: ${hint}` : 'Model Node';
  },
  setting: (b) => {
    const hint = extractHint(b, ['studio', 'beach', 'outdoor', 'indoor', 'urban', 'nature', 'desert', 'rooftop', 'forest', 'hotel', 'gym', 'café', 'cafe', 'street', 'mountain', 'abstract']);
    return hint ? `Setting Node: ${hint}` : 'Setting Node';
  },
  prompt: (b) => {
    const first = b.body.split('\n').find(l => l.trim() && !l.trim().startsWith('[API:'));
    const snippet = first ? first.replace(/\[API:[^\]]+\]/i, '').trim().slice(0, 40) : '';
    return snippet ? `Prompt: ${snippet}…` : 'Prompt Node';
  },
  carousel: (b) => `Carousel · ${b.slides?.length ?? 1} slides`,
  image_reference: (b) => b.imageName ? `Ref: ${b.imageName.slice(0, 28)}` : 'Image Reference',
};

export default function DirectorBlockActions({ blocks, onCreate, disabled }: Props) {
  const [status, setStatus] = useState<Record<string, 'idle' | 'working' | 'ok' | 'error'>>({});

  if (!blocks.length) return null;

  const handleClick = async (idx: number, b: DetectedBlock) => {
    const key = `${idx}`;
    setStatus((s) => ({ ...s, [key]: 'working' }));
    try {
      const nodeId = await onCreate({
        kind: b.kind,
        heading: b.heading,
        body: b.body,
        slides: b.slides,
        imageData: b.imageData,
        imageName: b.imageName,
        imageTags: b.imageTags,
        apiConfig: b.apiConfig,
      });
      setStatus((s) => ({ ...s, [key]: nodeId ? 'ok' : 'error' }));
    } catch {
      setStatus((s) => ({ ...s, [key]: 'error' }));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--studio-text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        Build:
      </span>
      {blocks.map((b, idx) => {
        const key = `${idx}`;
        const st = status[key] ?? 'idle';
        const Icon = ICON[b.kind];
        const isOk = st === 'ok';
        const isErr = st === 'error';
        const isWorking = st === 'working';
        return (
          <button
            key={`${b.kind}-${idx}`}
            type="button"
            disabled={disabled || isWorking || isOk}
            onClick={() => handleClick(idx, b)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
            style={{
              fontSize: 11,
              fontWeight: 600,
              cursor: disabled || isWorking || isOk ? 'default' : 'pointer',
              border: `1px ${isOk || isErr ? 'solid' : 'dashed'} ${
                isOk
                  ? 'color-mix(in srgb, #10B981 55%, transparent)'
                  : isErr
                  ? 'color-mix(in srgb, #F43F5E 55%, transparent)'
                  : 'var(--studio-border)'
              }`,
              background: isOk
                ? 'color-mix(in srgb, #10B981 12%, transparent)'
                : isErr
                ? 'color-mix(in srgb, #F43F5E 12%, transparent)'
                : 'var(--studio-surface)',
              color: isOk
                ? '#10B981'
                : isErr
                ? '#F43F5E'
                : 'var(--studio-text-sec)',
              opacity: disabled ? 0.55 : 1,
              transition: 'border-color 0.15s, background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (disabled || isWorking || isOk) return;
              e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--studio-accent) 45%, transparent)';
              e.currentTarget.style.background = 'color-mix(in srgb, var(--studio-accent) 10%, transparent)';
              e.currentTarget.style.color = 'var(--studio-text)';
            }}
            onMouseLeave={(e) => {
              if (disabled || isWorking || isOk) return;
              e.currentTarget.style.borderColor = isErr ? 'color-mix(in srgb, #F43F5E 55%, transparent)' : 'var(--studio-border)';
              e.currentTarget.style.background = isErr ? 'color-mix(in srgb, #F43F5E 12%, transparent)' : 'var(--studio-surface)';
              e.currentTarget.style.color = isErr ? '#F43F5E' : 'var(--studio-text-sec)';
            }}
          >
            {isWorking ? (
              <Loader2 size={11} className="animate-spin" />
            ) : isOk ? (
              <Check size={11} />
            ) : (
              <Icon size={11} />
            )}
            {LABEL[b.kind](b)}
          </button>
        );
      })}
    </div>
  );
}
