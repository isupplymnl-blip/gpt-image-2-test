import { AnthropicAdapter, getAnthropicAdapter } from './AnthropicAdapter';
import { spawn } from 'child_process';
import { join } from 'path';
import type { LLMAdapterId } from './types';

/* ============================================================================
 * VibecdAdapter — extends AnthropicAdapter, routes through vibecd.cc proxy.
 *
 * Feature deltas vs AnthropicAdapter:
 *  - supportsPromptCaching: true — cooperative fill model: client places
 *    strategic cache_control markers via addRollingCacheMarkers(); proxy
 *    counts existing markers in the body and fills remaining slots only.
 *    No double-injection risk.
 *  - token              → uses ANTHROPIC_AUTH_TOKEN_VIBECD if set, else falls back to main token
 * ========================================================================== */

export class VibecdAdapter extends AnthropicAdapter {
  override readonly id: LLMAdapterId    = 'vibecd';
  override readonly displayName: string = 'vibecd (Claude via proxy)';

  override readonly supportsTools: boolean         = true;
  override readonly supportsThinking: boolean      = true;
  override readonly supportsPromptCaching: boolean = true;
  // haiku excluded — contract: supportedModels guard required on both proxy routes.
  override readonly supportedModels: string[]      = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6'];

  protected override async fetchUpstream(
    _baseUrl: string,
    token: string,
    payloadBody: string,
    signal?: AbortSignal,
  ): Promise<Response | null> {
    const vibecdToken = process.env.ANTHROPIC_AUTH_TOKEN_VIBECD || token;
    const vibeUrl     = (process.env.VIBECD_BASE_URL ?? 'https://api.vibecd.cc').replace(/\/$/, '');

    // If pointing at a local port, ensure the bat proxy is running.
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?/i.test(vibeUrl)) {
      await VibecdAdapter.ensureLocalProxy(vibeUrl);
    }

    const headers: Record<string, string> = {
      'content-type':      'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key':         vibecdToken,
      'authorization':     `Bearer ${vibecdToken}`,
    };

    const abortCtl = new AbortController();
    const onAbort  = () => { try { abortCtl.abort(); } catch { /* ignore */ } };
    signal?.addEventListener('abort', onAbort);

    try {
      console.log(`[vibecd] → ${vibeUrl}/v1/messages`);
      const r = await fetch(`${vibeUrl}/v1/messages`, {
        method: 'POST', headers, body: payloadBody, signal: abortCtl.signal,
      });
      console.log(`[vibecd] ← ${r.status} ${r.statusText}`);
      if (r.ok && r.body) return r;

      const txt = await r.text().catch(() => '');
      console.error(`[vibecd] upstream error ${r.status}: ${txt.slice(0, 300)}`);
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[vibecd] upstream exception: ${msg}`);
      return null;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private static _launchAttempted = false;

  private static async ensureLocalProxy(baseUrl: string): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(1000),
      });
      void res; // any response = proxy alive
      return;
    } catch { /* ECONNREFUSED — proxy not running */ }

    if (VibecdAdapter._launchAttempted) return;
    VibecdAdapter._launchAttempted = true;

    const batPath = join(process.cwd(), '..', 'proxy-tunnel-app', 'vibe-claude.bat');
    console.log(`[vibecd] proxy not detected, launching: ${batPath}`);
    spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref();
  }
}

/* ── Singleton ──────────────────────────────────────────────────────────────── */

let _instance: VibecdAdapter | null = null;
export function getVibecdAdapter(): VibecdAdapter {
  if (!_instance) _instance = new VibecdAdapter();
  return _instance;
}

export { getAnthropicAdapter };
