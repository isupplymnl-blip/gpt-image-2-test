export const TEXT_EXT = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.log', '.html', '.xml', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.sh', '.ps1', '.ini', '.toml', '.env'];

// Comprehensive image MIME list — including formats some browsers don't auto-detect
export const IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'image/tif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];

// Image extensions for fallback when File.type is empty (HEIC on some browsers)
export const IMAGE_EXT = [
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.heic', '.heif', '.avif',
  '.bmp', '.tif', '.tiff',
  '.svg', '.ico',
];

// Accept attribute string for <input type="file"> — covers all supported image formats
export const IMAGE_ACCEPT = [...IMAGE_MIME, ...IMAGE_EXT].join(',');

// Accept attribute for "any" file picker — images + text + common docs
export const ANY_FILE_ACCEPT = [
  ...IMAGE_MIME,
  ...IMAGE_EXT,
  'text/*',
  'application/json',
  'application/pdf',
  'application/zip',
  ...TEXT_EXT,
].join(',');

export async function readText(file: File): Promise<string> {
  return await file.text();
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  // Primary: server-side conversion via heic-convert + sharp (downscaled JPEG, ~200-400KB)
  try {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch('/api/convert-heic', { method: 'POST', body: fd });
    if (res.ok) {
      return await res.blob();
    }
    const errBody = await res.text().catch(() => '');
    console.warn('[chatFiles] server HEIC convert failed, falling back to heic2any:', res.status, errBody);
  } catch (err) {
    console.warn('[chatFiles] server HEIC convert errored, falling back to heic2any:', err);
  }

  // Fallback: client-side heic2any → JPEG (no resize; client lacks sharp)
  if (typeof window === 'undefined') throw new Error('HEIC conversion requires browser or server route');
  const heic2anyMod = await import('heic2any');
  const heic2any = heic2anyMod.default ?? heic2anyMod;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  return Array.isArray(converted) ? converted[0] : converted as Blob;
}

// Canvas-based downscale for any image — caps longest edge, re-encodes JPEG.
// Used for non-HEIC images > 1MB (HEIC already gets server-side downscale).
async function downscaleImage(blob: Blob, maxDim = 2048, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('image decode failed'));
      i.src = url;
    });
    const { width, height } = img;
    const longest = Math.max(width, height);
    if (longest <= maxDim) return blob; // already small enough
    const scale = maxDim / longest;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res) => {
      canvas.toBlob((b) => res(b ?? blob), 'image/jpeg', quality);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readImageBase64(file: File): Promise<{ data: string; mime: string }> {
  // HEIC / HEIF aren't renderable in non-Safari browsers and aren't accepted by
  // gpt-image-2 / Gemini APIs. Convert to JPEG first (server-side preferred, client fallback).
  // Also downscale any large image (>1MB or >2048px) to keep payloads under nginx 1MB limits.
  let workFile: File | Blob = file;
  let outName = file.name;
  const lower = file.name.toLowerCase();
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
                 lower.endsWith('.heic') || lower.endsWith('.heif');

  if (isHeic) {
    try {
      workFile = await convertHeicToJpeg(file);
      outName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : JSON.stringify(err);
      console.error('[chatFiles] HEIC conversion failed:', msg);
      throw new Error(`Could not convert ${file.name} from HEIC. Try saving it as PNG/JPEG first. (${msg.split('\n')[0]})`);
    }
  }

  // Downscale any image still too big (skip GIF/SVG — animation/vector preservation).
  // HEIC path already downscaled server-side; this catches large PNG/JPEG/WebP.
  const skipDownscale = /\.(gif|svg)$/i.test(outName);
  if (!skipDownscale && workFile.size > 1_000_000) {
    try {
      const before = workFile.size;
      workFile = await downscaleImage(workFile, 2048, 0.85);
      outName = outName.replace(/\.(png|webp|avif|bmp|tiff?)$/i, '.jpg');
      if (!/\.jpe?g$/i.test(outName)) outName = outName.replace(/\.[^.]+$/, '') + '.jpg';
      console.log(`[chatFiles] downscaled ${file.name}: ${(before/1024).toFixed(0)}KB → ${(workFile.size/1024).toFixed(0)}KB`);
    } catch (err) {
      console.warn('[chatFiles] downscale failed, sending original:', err);
    }
  }

  const buf = await workFile.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Chunked to avoid stack overflow on large files
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  const data = btoa(bin);
  const name = outName.toLowerCase();
  // Fallback MIME by extension when File.type is empty (HEIC/AVIF on some browsers)
  let mime = (workFile as File).type || file.type;
  if (isHeic) mime = 'image/jpeg'; // post-conversion (HEIC → JPEG now)
  if (/\.jpe?g$/i.test(name)) mime = 'image/jpeg'; // post-downscale always JPEG
  if (!mime) {
    if (name.endsWith('.heic')) mime = 'image/heic';
    else if (name.endsWith('.heif')) mime = 'image/heif';
    else if (name.endsWith('.avif')) mime = 'image/avif';
    else if (name.endsWith('.webp')) mime = 'image/webp';
    else if (name.endsWith('.png'))  mime = 'image/png';
    else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mime = 'image/jpeg';
    else if (name.endsWith('.gif'))  mime = 'image/gif';
    else mime = 'image/jpeg';
  }
  return { data, mime };
}

export function isTextLike(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json') return true;
  const name = file.name.toLowerCase();
  return TEXT_EXT.some((e) => name.endsWith(e));
}

export function isImage(file: File): boolean {
  if (IMAGE_MIME.includes(file.type)) return true;
  // Fallback: check by extension when MIME is missing/wrong
  const name = file.name.toLowerCase();
  return IMAGE_EXT.some((e) => name.endsWith(e));
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
