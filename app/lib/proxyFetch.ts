import { ProxyAgent, fetch as undiciFetch, FormData as UndiciFormData } from 'undici';

let _agent: ProxyAgent | undefined;
let _agentUrl: string | undefined;

function getAgent(): ProxyAgent | undefined {
  const proxyUrl = process.env.OUTBOUND_PROXY_URL;
  if (!proxyUrl) return undefined;
  if (proxyUrl !== _agentUrl) {
    _agent = new ProxyAgent(proxyUrl, {
      headersTimeout: 300_000,
      bodyTimeout: 600_000,
      connectTimeout: 10_000,
    });
    _agentUrl = proxyUrl;
    console.log('[proxyFetch] agent initialized for', proxyUrl);
  }
  return _agent;
}

/** Convert a global FormData to undici FormData so it serializes correctly. */
async function toUndiciFormData(form: FormData): Promise<UndiciFormData> {
  const out = new UndiciFormData();
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      const buf = await value.arrayBuffer();
      out.append(key, new Blob([buf], { type: value.type }), value.name);
    } else {
      out.append(key, value);
    }
  }
  return out;
}

/** Drop-in fetch that routes through OUTBOUND_PROXY_URL if set. */
export async function proxyFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const agent = getAgent();
  if (agent) {
    console.log('[proxyFetch] routing via proxy:', _agentUrl, '->', url);
    try {
      let body = init.body;
      if (body instanceof FormData) {
        body = await toUndiciFormData(body) as any;
      }
      return await undiciFetch(url, { ...init, body, dispatcher: agent } as any) as unknown as Response;
    } catch (err: any) {
      console.error('[proxyFetch] fetch failed via proxy:', err?.cause ?? err?.message ?? err);
      throw err;
    }
  }
  return fetch(url, init);
}

/** True if an outbound proxy is configured. */
export const hasProxy = Boolean(process.env.OUTBOUND_PROXY_URL);

/** The proxy URL (for SDK httpOptions or dispatcher setup). */
export const proxyUrl = process.env.OUTBOUND_PROXY_URL;
