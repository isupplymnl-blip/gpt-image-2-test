/**
 * Relay client for submitting long-running requests to GCP VM relay server
 *
 * Flow:
 * 1. Submit request → get jobId immediately
 * 2. Poll /job/:jobId every 3s until status !== 'pending'
 * 3. Reconstruct Response-like object from result
 */

const RELAY_URL = process.env.RELAY_URL;
const MAX_POLL_TIME = 600_000; // 10 min
const POLL_INTERVAL = 3_000; // 3s

interface RelaySubmitResponse {
  jobId: string;
}

interface RelayJobResponse {
  status: 'pending' | 'done' | 'error';
  result?: {
    status: number;
    body: string; // base64
    contentType: string;
  };
  error?: string;
}

/**
 * Compress image buffer to reduce processing time
 * Target: 384x384 JPEG Q80 for ~75% size reduction
 */
async function compressImage(buf: Buffer): Promise<Buffer> {
  try {
    const sharp = require('sharp');
    const img = sharp(buf);
    const meta = await img.metadata();
    console.log(`[relayClient] original image: ${meta.width}x${meta.height} ${meta.format}`);

    // Only compress if larger than 384x384
    if ((meta.width || 0) <= 384 && (meta.height || 0) <= 384) {
      console.log(`[relayClient] image already small, skipping compression`);
      return buf;
    }

    const compressed = await sharp(buf)
      .resize(384, 384, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    console.log(`[relayClient] compressed to 384x384 JPEG Q80`);
    return compressed;
  } catch (err) {
    console.warn('[relayClient] sharp not available, using original image:', err);
    return buf;
  }
}

/**
 * Serialize FormData to base64 for relay transmission
 */
async function serializeFormData(form: FormData): Promise<{ body: string; boundary: string }> {
  // Convert FormData to multipart/form-data buffer
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];

  for (const [key, value] of form.entries()) {
    parts.push(Buffer.from(`--${boundary}\r\n`));

    if (value instanceof Blob) {
      const arrayBuf = await value.arrayBuffer();
      let buf = Buffer.from(arrayBuf);

      // Compress reference images to reduce processing time
      if (key === 'image[]') {
        const originalSize = buf.length;
        buf = await compressImage(buf);
        console.log(`[relayClient] compressed ${key}: ${(originalSize/1024).toFixed(1)}KB → ${(buf.length/1024).toFixed(1)}KB`);
      }

      const filename = (value as any).name || 'file';
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"; filename="${filename}"\r\n`));
      parts.push(Buffer.from(`Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`));
      parts.push(buf);
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
      parts.push(Buffer.from(String(value)));
      parts.push(Buffer.from('\r\n'));
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const fullBuffer = Buffer.concat(parts);
  return { body: fullBuffer.toString('base64'), boundary };
}

/**
 * Submit request to relay and poll until complete
 */
export async function relayFetch(url: string, init: RequestInit): Promise<Response> {
  if (!RELAY_URL) {
    throw new Error('RELAY_URL not configured');
  }

  console.log('[relayClient] submitting to relay:', RELAY_URL);

  // Serialize body
  let bodyBase64: string | undefined;
  let headers = { ...(init.headers as Record<string, string> || {}) };

  if (init.body instanceof FormData) {
    const { body, boundary } = await serializeFormData(init.body);
    bodyBase64 = body;
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  } else if (typeof init.body === 'string') {
    bodyBase64 = Buffer.from(init.body).toString('base64');
  } else if (init.body) {
    throw new Error('Unsupported body type for relay');
  }

  // Submit job
  const submitRes = await fetch(`${RELAY_URL}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      method: init.method || 'GET',
      headers,
      bodyBase64,
    }),
  });

  if (!submitRes.ok) {
    throw new Error(`Relay submit failed: ${submitRes.status} ${await submitRes.text()}`);
  }

  const { jobId } = await submitRes.json() as RelaySubmitResponse;
  console.log('[relayClient] job submitted:', jobId);

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const pollRes = await fetch(`${RELAY_URL}/job/${jobId}`);
    if (!pollRes.ok) {
      throw new Error(`Relay poll failed: ${pollRes.status}`);
    }

    const job = await pollRes.json() as RelayJobResponse;
    console.log('[relayClient] poll status:', job.status);

    if (job.status === 'done') {
      if (!job.result) {
        throw new Error('Relay job done but no result');
      }

      // Reconstruct Response
      const bodyBuffer = Buffer.from(job.result.body, 'base64');
      return new Response(bodyBuffer, {
        status: job.result.status,
        headers: {
          'Content-Type': job.result.contentType || 'application/octet-stream',
        },
      });
    }

    if (job.status === 'error') {
      throw new Error(`Relay job error: ${job.error}`);
    }

    // status === 'pending', continue polling
  }

  throw new Error(`Relay job timed out after ${MAX_POLL_TIME}ms`);
}

/**
 * Check if relay is available
 */
export function isRelayAvailable(): boolean {
  return !!RELAY_URL;
}
