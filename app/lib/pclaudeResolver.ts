import { readFile } from 'fs/promises';
import { join } from 'path';

const CACHE_TTL_MS = 5000;

let cache: { url: string | null; at: number } | null = null;

async function readConfigPort(): Promise<number | null> {
  const candidates = [
    process.env.PCLAUDE_CONFIG_PATH,
    join(process.cwd(), '..', 'proxy-tunnel-app', 'config.json'),
    join(process.cwd(), '..', '..', 'proxy-tunnel-app', 'config.json'),
    join(process.cwd(), '..', '..', 'GitHub', 'proxy-tunnel-app', 'config.json'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = JSON.parse(raw) as { port?: number };
      if (typeof parsed.port === 'number') return parsed.port;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * If `envUrl` points at a local pclaude instance, rewrite it to the port
 * currently set in proxy-tunnel-app/config.json (always uses 127.0.0.1 to
 * sidestep Node's IPv6-first resolution on Windows). Returns envUrl unchanged
 * for non-local URLs. Returns null if local but config.json unreadable.
 *
 * Trusts config.json as source of truth — pclaude only rotates ports at
 * launch and writes the choice back to config.json. The retry chain handles
 * the "pclaude not actually running" case naturally.
 */
export async function resolveLocalUpstream(envUrl: string): Promise<string | null> {
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?/i.test(envUrl);
  if (!isLocal) return envUrl;

  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.url;

  const port = await readConfigPort();
  const url = port === null ? null : `http://127.0.0.1:${port}`;
  cache = { url, at: now };
  return url;
}
