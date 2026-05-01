/**
 * Parses Director assistant output into detected blocks that can map
 * to canvas node tool calls. All detection is tolerant of markdown
 * heading prefixes (## / ###), emoji prefixes, and plain text headings.
 */

export type BlockKind =
  | 'model'
  | 'setting'
  | 'prompt'
  | 'carousel'
  | 'image_reference';

export interface DetectedBlock {
  kind: BlockKind;
  heading: string;
  body: string;
  // For carousels: extracted per-slide prompts.
  slides?: string[];
  // For image_reference: attached image data from chat
  imageData?: string;
  imageName?: string;
  imageTags?: string[];
  // API config extracted from [API: ...] tags
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

interface HeadingMatch {
  kind: BlockKind | null;
  idx: number;
  headingLine: string;
  slideNumber?: number;
}

const BLOCK_MATCHERS: Array<{ kind: BlockKind; re: RegExp }> = [
  { kind: 'model', re: /^(?:🧍|##)\s*model block/i },
  { kind: 'setting', re: /^(?:🏖️|##)\s*setting block/i },
  { kind: 'prompt', re: /^(?:🎬|##)\s*master prompt/i },
];

const SLIDE_RE = /^(?:#{1,6}\s*)?(?:🎬\s*)?(?:carousel\s+)?(?:master prompt[\s—\-:]*)?(?:slide|frame|image)\s*(\d+)\b/i;
const CAROUSEL_PARENT_RE = /\bcarousel\b|\b\d+[-\s]?slides?\b|\b\d+\s+slides?\b/i;

function classifyHeading(line: string): HeadingMatch['kind'] {
  for (const m of BLOCK_MATCHERS) {
    if (m.re.test(line)) return m.kind;
  }
  return null;
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Markdown separator followed by heading
  if (/^---+\s*#{1,6}\s+/.test(trimmed)) return true;
  // Markdown headers
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  // Bold text that looks like a heading (but NOT metadata like "**Model:** value" or "**STEP N**")
  if (/^\*\*[^*:]+\*\*\s*$/.test(trimmed)) return true;
  // Emoji-led headings (including variation selectors / skin tone modifiers)
  if (/^\p{Emoji}/u.test(trimmed)) return true;
  // Specific block patterns - only match actual block headings, not references to them
  if (/^(?:model block|setting block|product block|master prompt|carousel)\b/i.test(trimmed)) return true;
  return false;
}

function cleanHeading(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim();
}


export function parseDirectorOutput(raw: string): DetectedBlock[] {
  if (!raw || !raw.trim()) return [];
  const lines = raw.split(/\r?\n/);

  // First pass: find heading candidates.
  const headings: HeadingMatch[] = [];
  let insideSlide = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Treat --- separator as boundary (null heading)
    if (/^---+\s*$/.test(line.trim())) {
      headings.push({ kind: null, idx: i, headingLine: '---' });
      insideSlide = false;
      continue;
    }
    if (!isHeadingLine(line)) continue;
    const cleaned = cleanHeading(line);
    const slideMatch = SLIDE_RE.exec(cleaned);
    if (slideMatch) {
      headings.push({
        kind: 'prompt',
        idx: i,
        headingLine: cleaned,
        slideNumber: parseInt(slideMatch[1], 10),
      });
      insideSlide = true;
      continue;
    }

    // Skip heading detection if we're inside a carousel slide
    if (insideSlide) continue;

    const kind = classifyHeading(cleaned);
    if (kind) {
      headings.push({ kind, idx: i, headingLine: cleaned });
    } else {
      // Unclassified heading acts as boundary
      headings.push({ kind: null, idx: i, headingLine: cleaned });
    }
  }

  if (headings.length === 0) return [];

  const blocks: DetectedBlock[] = [];
  for (let h = 0; h < headings.length; h += 1) {
    const cur = headings[h];
    const next = headings[h + 1];
    const endIdx = next ? next.idx : lines.length;
    let bodyLines = lines.slice(cur.idx + 1, endIdx);

    // Strip instruction lines (→ PASTE INTO:, TAGS for, ALREADY INCLUDED IN:, etc.)
    bodyLines = bodyLines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true; // keep blank lines
      if (/^→/.test(trimmed)) return false;
      if (/^PASTE INTO:/i.test(trimmed)) return false;
      if (/^TAGS for/i.test(trimmed)) return false;
      if (/^ALREADY INCLUDED IN:/i.test(trimmed)) return false;
      if (/^AUTO-FILLED by/i.test(trimmed)) return false;
      return true;
    });

    const body = bodyLines
      .join('\n')
      .replace(/^\s*\n+/, '')
      .replace(/\n+\s*$/, '')
      .trim();
    if (!cur.kind) continue;

    // Extract API config from [API: ...] tag if present
    const apiConfig = extractApiTag(body);

    blocks.push({
      kind: cur.kind,
      heading: cur.headingLine,
      body,
      apiConfig: apiConfig ?? undefined,
    });
  }

  // Collapse consecutive "Slide N" prompt blocks into one carousel.
  const slidePrompts: string[] = [];
  let firstSlideIdx = -1;
  headings.forEach((h, i) => {
    if (h.slideNumber !== undefined && h.kind === 'prompt') {
      if (firstSlideIdx === -1) firstSlideIdx = i;
      const b = blocks.find((bl) => bl.heading === h.headingLine);
      if (b) slidePrompts.push(b.body);
    }
  });

  if (slidePrompts.length >= 2) {
    const filtered = blocks.filter((b) => {
      if (b.kind !== 'prompt') return true;
      if (/(?:carousel\s+)?(?:slide|frame|image)\s*\d+/i.test(b.heading)) return false;
      if (CAROUSEL_PARENT_RE.test(b.heading)) return false;
      return true;
    });

    // Extract API config from first slide (all slides should share same config)
    const firstSlideBlock = blocks.find((b) =>
      b.kind === 'prompt' && /(?:carousel\s+)?(?:slide|frame|image)\s*\d+/i.test(b.heading)
    );

    filtered.push({
      kind: 'carousel',
      heading: `Carousel — ${slidePrompts.length} slides`,
      body: slidePrompts.join('\n\n---\n\n'),
      slides: slidePrompts,
      apiConfig: firstSlideBlock?.apiConfig,
    });
    return filtered;
  }

  return blocks;
}

/** Attempts to extract a JSON-style API config object from the API Configuration block body. */
export function extractApiConfig(body: string): Record<string, number | string> | null {
  if (!body) return null;
  const jsonMatch = body.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, number | string>;
  } catch {
    /* ignore */
  }
  // Fallback: regex key: value pairs
  const out: Record<string, number | string> = {};
  const pairs = body.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*([\d.]+|"[^"]+"|'[^']+')/g);
  for (const p of pairs) {
    const v = p[2];
    if (/^[\d.]+$/.test(v)) out[p[1]] = parseFloat(v);
    else out[p[1]] = v.replace(/^['"]|['"]$/g, '');
  }
  return Object.keys(out).length ? out : null;
}

/** Extract API config from [API: ...] tag in text */
export function extractApiTag(text: string): {
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  seed?: number;
  quality?: 'low' | 'medium' | 'high';
  size?: string;
  output_format?: 'png' | 'jpeg' | 'webp';
  background?: 'transparent' | 'opaque' | 'auto';
  n?: number;
} | null {
  const match = text.match(/\[API:\s*([^\]]+)\]/i);
  if (!match) return null;

  const content = match[1];
  const config: Record<string, string | number> = {};

  // Parse key=value pairs
  const pairs = content.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^,\s]+)/g);
  for (const [, key, value] of pairs) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'model') {
      config.model = value;
    } else if (lowerKey === 'temp' || lowerKey === 'temperature') {
      config.temperature = parseFloat(value);
    } else if (lowerKey === 'topp' || lowerKey === 'top_p') {
      config.topP = parseFloat(value);
    } else if (lowerKey === 'topk' || lowerKey === 'top_k') {
      config.topK = parseInt(value, 10);
    } else if (lowerKey === 'seed') {
      config.seed = parseInt(value, 10);
    } else if (lowerKey === 'quality') {
      config.quality = value;
    } else if (lowerKey === 'size') {
      config.size = value;
    } else if (lowerKey === 'output_format' || lowerKey === 'format') {
      config.output_format = value;
    } else if (lowerKey === 'background') {
      config.background = value;
    } else if (lowerKey === 'n') {
      config.n = parseInt(value, 10);
    }
  }

  return Object.keys(config).length > 0 ? config : null;
}
