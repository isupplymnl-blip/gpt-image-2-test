export interface UsageEntry {
  at: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface UsageOverride {
  expiresAt: number;
  hours: number;
}

export interface Usage {
  entries: UsageEntry[];
  sessionStart: number | null;
  weekStart: number;
  override?: UsageOverride | null;
}

export const SESSION_MS = 3 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const CAPS = {
  sessionCost: 3.0,
  weeklyCost: 20.0,
};

const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-opus-4-7[1m]': { in: 15, out: 75 },
  'claude-opus-4-6': { in: 15, out: 75 },
  'claude-opus-4-5': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-3-7-sonnet-latest': { in: 3, out: 15 },
  'claude-3-5-sonnet-latest': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4 },
};
const DEFAULT_PRICE = { in: 3, out: 15 };

export function priceOf(model: string) {
  return PRICING[model] || DEFAULT_PRICE;
}

export function costOf(model: string, inTok: number, outTok: number): number {
  const p = priceOf(model);
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}

const KEY = 'nbs-usage-v1';

export function loadUsage(): Usage {
  if (typeof window === 'undefined') return { entries: [], sessionStart: null, weekStart: Date.now() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { entries: [], sessionStart: null, weekStart: Date.now() };
    return JSON.parse(raw) as Usage;
  } catch { return { entries: [], sessionStart: null, weekStart: Date.now() }; }
}

export function saveUsage(u: Usage) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(u));
}

export function pruneUsage(u: Usage): Usage {
  const now = Date.now();
  let sessionStart = u.sessionStart;
  if (sessionStart && now - sessionStart > SESSION_MS) sessionStart = null;
  let weekStart = u.weekStart;
  if (!weekStart || now - weekStart > WEEK_MS) weekStart = now;
  const entries = u.entries.filter((e) => now - e.at <= WEEK_MS);
  let override = u.override;
  if (override && now >= override.expiresAt) override = null;
  return { entries, sessionStart, weekStart, override };
}

export function setOverride(u: Usage, hours: number): Usage {
  const clamped = Math.max(1, Math.min(5, hours));
  const next = { ...u, override: { expiresAt: Date.now() + clamped * 60 * 60 * 1000, hours: clamped } };
  saveUsage(next);
  return next;
}

export function clearOverride(u: Usage): Usage {
  const next = { ...u, override: null };
  saveUsage(next);
  return next;
}

export function isOverrideActive(u: Usage): boolean {
  return !!u.override && Date.now() < u.override.expiresAt;
}

export function addUsage(u: Usage, entry: Omit<UsageEntry, 'at' | 'cost'> & { at?: number; cost?: number }): Usage {
  const now = entry.at || Date.now();
  const cost = entry.cost ?? costOf(entry.model, entry.inputTokens, entry.outputTokens);
  const fullEntry: UsageEntry = { at: now, model: entry.model, inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, cost };
  const next = pruneUsage({ ...u, entries: [...u.entries, fullEntry], sessionStart: u.sessionStart ?? now });
  saveUsage(next);
  return next;
}

export interface UsageStats {
  sessionCost: number;
  sessionPct: number;
  sessionResetsAt: number | null;
  sessionActive: boolean;
  weeklyCost: number;
  weeklyPct: number;
  weeklyResetsAt: number;
  totalInput: number;
  totalOutput: number;
  totalRequests: number;
  byModel: { model: string; cost: number; requests: number; inputTokens: number; outputTokens: number }[];
  overrideActive: boolean;
  overrideExpiresAt: number | null;
  overrideHours: number | null;
}

export function computeStats(u: Usage): UsageStats {
  const now = Date.now();
  const sessionActive = u.sessionStart !== null && now - u.sessionStart < SESSION_MS;
  const sessionEntries = sessionActive && u.sessionStart
    ? u.entries.filter((e) => e.at >= (u.sessionStart as number))
    : [];
  const sessionCost = sessionEntries.reduce((s, e) => s + e.cost, 0);

  const weekEntries = u.entries.filter((e) => now - e.at <= WEEK_MS);
  const weeklyCost = weekEntries.reduce((s, e) => s + e.cost, 0);

  const byModelMap: Record<string, { model: string; cost: number; requests: number; inputTokens: number; outputTokens: number }> = {};
  for (const e of weekEntries) {
    if (!byModelMap[e.model]) byModelMap[e.model] = { model: e.model, cost: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
    byModelMap[e.model].cost += e.cost;
    byModelMap[e.model].requests += 1;
    byModelMap[e.model].inputTokens += e.inputTokens;
    byModelMap[e.model].outputTokens += e.outputTokens;
  }

  return {
    sessionCost,
    sessionPct: Math.min(100, (sessionCost / CAPS.sessionCost) * 100),
    sessionResetsAt: u.sessionStart ? u.sessionStart + SESSION_MS : null,
    sessionActive,
    weeklyCost,
    weeklyPct: Math.min(100, (weeklyCost / CAPS.weeklyCost) * 100),
    weeklyResetsAt: u.weekStart + WEEK_MS,
    totalInput: weekEntries.reduce((s, e) => s + e.inputTokens, 0),
    totalOutput: weekEntries.reduce((s, e) => s + e.outputTokens, 0),
    totalRequests: weekEntries.length,
    byModel: Object.values(byModelMap).sort((a, b) => b.cost - a.cost),
    overrideActive: isOverrideActive(u),
    overrideExpiresAt: u.override?.expiresAt ?? null,
    overrideHours: u.override?.hours ?? null,
  };
}

export function wouldExceed(u: Usage, model: string, estInputTokens: number, estOutputTokens = 2048): { ok: boolean; reason?: string } {
  if (isOverrideActive(u)) return { ok: true };
  const est = costOf(model, estInputTokens, estOutputTokens);
  const stats = computeStats(u);
  if (stats.sessionCost + est > CAPS.sessionCost) {
    const reset = stats.sessionResetsAt ? new Date(stats.sessionResetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'soon';
    return { ok: false, reason: `Session limit reached ($${CAPS.sessionCost.toFixed(2)} / 3hr). Resets ${reset}. Enable override in Settings to bypass.` };
  }
  if (stats.weeklyCost + est > CAPS.weeklyCost) {
    const reset = new Date(stats.weeklyResetsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return { ok: false, reason: `Weekly limit reached ($${CAPS.weeklyCost.toFixed(2)}). Resets ${reset}. Enable override in Settings to bypass.` };
  }
  return { ok: true };
}

export function formatResetTime(at: number): string {
  const now = Date.now();
  const diff = at - now;
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h === 0) return `${m}m`;
  if (h < 24) return `${h}h ${m}m`;
  const d = new Date(at);
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function estimateInputTokens(messages: { content: string; images?: { data: string }[] }[], systemLen: number): number {
  let chars = systemLen;
  for (const m of messages) {
    chars += m.content.length;
    if (m.images) chars += m.images.length * 1200 * 4;
  }
  return Math.ceil(chars / 4);
}
