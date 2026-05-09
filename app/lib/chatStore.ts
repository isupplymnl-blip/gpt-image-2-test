export type Role = 'user' | 'assistant';

export interface ImageAttachment {
  id: string;
  kind: 'product' | 'style' | 'model' | 'file';
  name: string;
  mime: string;
  data: string;
  size: number;
  url?: string; // set after auto-save; when present, data is stripped to save localStorage space
}

export interface BrandDna {
  name: string;
  content: string;
  size: number;
}

export interface ToolUseRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  errorMsg?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  images?: ImageAttachment[];
  toolUses?: ToolUseRecord[];
  toolResults?: Array<{ tool_use_id: string; content: string; is_error?: boolean }>;
  // Live thinking progress (cleared when text starts streaming)
  thinking?: { active: boolean; elapsedMs: number; chars: number };
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  brandDna?: BrandDna | null;
  createdAt: number;
  updatedAt: number;
  automateBatchId?: string;
  provider?: 'gemini' | 'openai' | 'pudding-openai' | 'ecco' | 'pudding' | 'ithink-openai' | 'grsai' | 'uocode-openai';
}

const KEY = 'nbs-chats-v1';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadChats(): Chat[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Chat[];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  if (typeof window === 'undefined') return;

  // Strip large base64 from images before persisting — localStorage cap is ~5-10 MB.
  // Live in-memory state keeps `data` for previews; persisted copy keeps only meta + url.
  const slim: Chat[] = chats.map((c) => ({
    ...c,
    messages: c.messages.map((m) => ({
      ...m,
      images: m.images?.map((img) => ({
        ...img,
        // Drop base64 — it can be re-fetched from `url` after auto-save, or re-uploaded
        data: img.url ? '' : (img.data.length > 200_000 ? '' : img.data),
      })),
    })),
  }));

  const tryWrite = (payload: Chat[]): boolean => {
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
        return false;
      }
      throw err;
    }
  };

  if (tryWrite(slim)) return;

  // Still over quota — drop ALL base64 data, then retry
  const slimmer: Chat[] = slim.map((c) => ({
    ...c,
    messages: c.messages.map((m) => ({ ...m, images: m.images?.map((img) => ({ ...img, data: '' })) })),
  }));
  if (tryWrite(slimmer)) return;

  // Still failing — drop oldest chats one by one
  let trimmed = slimmer;
  while (trimmed.length > 1 && !tryWrite(trimmed)) {
    trimmed = trimmed.slice(0, -1);
  }
  if (trimmed.length === 0) {
    console.warn('[chatStore] localStorage full; could not persist chats');
  }
}

export function newChat(opts?: { automateBatchId?: string; title?: string }): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title: opts?.title ?? 'New chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
    automateBatchId: opts?.automateBatchId,
  };
}

export function titleFromText(t: string): string {
  const s = t.trim().replace(/\s+/g, ' ');
  return s.length > 48 ? s.slice(0, 48) + '…' : s || 'New chat';
}
