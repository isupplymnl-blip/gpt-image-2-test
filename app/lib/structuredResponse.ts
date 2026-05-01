export interface FollowUpOption {
  label: string;
  description: string;
}

export interface StructuredQuestion {
  question: string;
  follow_up: FollowUpOption[];
}

export type FormFieldType = 'text' | 'number' | 'select';

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  default?: string | number;
  placeholder?: string;
  auto_from?: string;
}

export interface StructuredForm {
  title: string;
  intro?: string;
  fields: FormField[];
  submit_label?: string;
}

export interface AssetPickerConfig {
  title: string;
  filter?: string;   // optional tag filter, e.g. "product" | "style" | "all"
  multi?: boolean;   // default false — single selection
  submit_label?: string;
}

export interface ParsedMessage {
  preface?: string;
  structured?: StructuredQuestion;
  form?: StructuredForm;
  assetPicker?: AssetPickerConfig;
  trailing?: string;
  rawText: string;
}

function isStructured(value: unknown): value is StructuredQuestion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.question !== 'string') return false;
  if (!Array.isArray(v.follow_up)) return false;
  return v.follow_up.every(
    (o) =>
      o !== null &&
      typeof o === 'object' &&
      typeof (o as Record<string, unknown>).label === 'string' &&
      typeof (o as Record<string, unknown>).description === 'string',
  );
}

export function isForm(value: unknown): value is StructuredForm {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string') return false;
  if (!Array.isArray(v.fields)) return false;
  return v.fields.every((f) => {
    if (!f || typeof f !== 'object') return false;
    const field = f as Record<string, unknown>;
    if (typeof field.id !== 'string') return false;
    if (typeof field.label !== 'string') return false;
    if (field.type !== 'text' && field.type !== 'number' && field.type !== 'select') return false;
    if (field.type === 'select') {
      if (!Array.isArray(field.options)) return false;
      if (!field.options.every((o) => typeof o === 'string')) return false;
    }
    return true;
  });
}

function findJsonCandidates(raw: string): Array<{ start: number; end: number; body: string }> {
  const candidates: Array<{ start: number; end: number; body: string }> = [];

  const matchesKeywords = (body: string): boolean => {
    if (body.includes('"question"') && body.includes('"follow_up"')) return true;
    if (body.includes('"form"')) return true;
    if (body.includes('"asset_picker"')) return true;
    return false;
  };

  // Fenced blocks: ```json ... ``` or ``` ... ```
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(raw)) !== null) {
    const inner = m[1];
    if (inner && matchesKeywords(inner)) {
      candidates.push({ start: m.index, end: m.index + m[0].length, body: inner.trim() });
    }
  }

  // Bare objects — brace-balanced scan
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let j = i; j < raw.length; j++) {
      const ch = raw[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const body = raw.slice(i, j + 1);
          if (matchesKeywords(body)) {
            candidates.push({ start: i, end: j + 1, body });
          }
          break;
        }
      }
    }
  }

  return candidates;
}

export function parseStructuredResponse(raw: string): ParsedMessage {
  if (!raw || typeof raw !== 'string') return { rawText: raw ?? '' };

  try {
    const candidates = findJsonCandidates(raw);
    for (const c of candidates) {
      try {
        const parsed = JSON.parse(c.body);
        if (!parsed || typeof parsed !== 'object') continue;
        const obj = parsed as Record<string, unknown>;

        if (isForm(obj.form)) {
          const preface = raw.slice(0, c.start).trim();
          const trailing = raw.slice(c.end).trim();
          return {
            preface: preface || undefined,
            form: obj.form as StructuredForm,
            trailing: trailing || undefined,
            rawText: raw,
          };
        }

        if (obj.asset_picker && typeof obj.asset_picker === 'object') {
          const ap = obj.asset_picker as Record<string, unknown>;
          if (typeof ap.title === 'string') {
            const preface = raw.slice(0, c.start).trim();
            const trailing = raw.slice(c.end).trim();
            return {
              preface: preface || undefined,
              assetPicker: {
                title: ap.title,
                filter: typeof ap.filter === 'string' ? ap.filter : undefined,
                multi: ap.multi === true,
                submit_label: typeof ap.submit_label === 'string' ? ap.submit_label : undefined,
              },
              trailing: trailing || undefined,
              rawText: raw,
            };
          }
        }

        if (isStructured(parsed)) {
          const preface = raw.slice(0, c.start).trim();
          const trailing = raw.slice(c.end).trim();
          return {
            preface: preface || undefined,
            structured: parsed,
            trailing: trailing || undefined,
            rawText: raw,
          };
        }
      } catch {
        // try next candidate
      }
    }
  } catch {
    // swallow
  }

  return { rawText: raw };
}
