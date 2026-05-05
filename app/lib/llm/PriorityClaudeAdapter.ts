import { AnthropicAdapter, getAnthropicAdapter } from './AnthropicAdapter';
import type { LLMAdapterId } from './types';

/* ============================================================================
 * PriorityClaudeAdapter — extends AnthropicAdapter, routes through routeai.cc.
 *
 * supportsPromptCaching: false — proxy owns cache placement on this route.
 * cache_hint injection is active in priority-claude config. Do NOT call
 * addRollingCacheMarkers() here. AnthropicAdapter skips all cache_control
 * injection when supportsPromptCaching is false.
 *
 * Inherits: [proxy] guard, SSE parse loop, retry chain, tool loop, everything.
 * ========================================================================== */

export class PriorityClaudeAdapter extends AnthropicAdapter {
  override readonly id: LLMAdapterId    = 'priority-claude';
  override readonly displayName: string = 'Priority Claude (routeai.cc)';

  // Proxy owns cache placement — do not inject cache_control markers.
  override readonly supportsPromptCaching: boolean = false;

  // haiku excluded — routeai.cc deprioritizes haiku. If haiku is ever added to
  // selectModel(), this constraint prevents it from reaching this route.
  override readonly supportedModels: string[] = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6'];

  protected override async fetchUpstream(
    _baseUrl: string,
    token: string,
    payloadBody: string,
    signal?: AbortSignal,
  ): Promise<Response | null> {
    const baseUrl = process.env.PRIORITY_CLAUDE_BASE_URL;
    if (!baseUrl) {
      throw new Error('PRIORITY_CLAUDE_BASE_URL not configured — set this env var to the routeai.cc endpoint');
    }
    const url = baseUrl.replace(/\/$/, '') + '/v1/messages';

    const headers: Record<string, string> = {
      'content-type':      'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key':         token,
      'authorization':     `Bearer ${token}`,
    };

    const abortCtl = new AbortController();
    const onAbort  = () => { try { abortCtl.abort(); } catch { /* ignore */ } };
    signal?.addEventListener('abort', onAbort);

    try {
      console.log(`[priority-claude] → ${url}`);
      const r = await fetch(url, {
        method: 'POST', headers, body: payloadBody, signal: abortCtl.signal,
      });
      console.log(`[priority-claude] ← ${r.status} ${r.statusText}`);
      if (r.ok && r.body) return r;

      const txt = await r.text().catch(() => '');
      console.error(`[priority-claude] upstream error ${r.status}: ${txt.slice(0, 300)}`);
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[priority-claude] upstream exception: ${msg}`);
      return null;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/* ── Singleton ──────────────────────────────────────────────────────────────── */

let _instance: PriorityClaudeAdapter | null = null;
export function getPriorityClaudeAdapter(): PriorityClaudeAdapter {
  if (!_instance) _instance = new PriorityClaudeAdapter();
  return _instance;
}

export { getAnthropicAdapter };
