/**
 * Shared OpenAI size resolver for all OpenAI-compatible routes.
 *
 * gpt-image-2 constraints:
 *   - Both dimensions must be multiples of 16
 *   - Max edge ≤ 3840 px
 *   - Total pixels between 655,360 and 8,294,400
 *   - Long-to-short ratio ≤ 3:1
 *
 * Priority: imageSize tier (1K/2K/4K) > explicitSize pixel string > nothing (API default)
 * Rationale: the tier buttons are a deliberate quality override. The explicit size dropdown
 * sets the aspect ratio; the tier scales it up. When both are set, tier wins on resolution
 * but the aspect ratio is derived from explicitSize if no separate aspectRatio is provided.
 */
export function resolveOpenAISize(
  imageSize?: string,
  aspectRatio?: string,
  explicitSize?: string,
): string | undefined {
  // Derive aspect ratio: prefer the dedicated aspectRatio field, fall back to parsing explicitSize
  let resolvedRatio = aspectRatio;
  if (!resolvedRatio && explicitSize) {
    const clean = String(explicitSize).replace(/×/g, 'x');
    const [ew, eh] = clean.split('x').map(Number);
    if (ew && eh && !isNaN(ew) && !isNaN(eh)) {
      resolvedRatio = `${ew}:${eh}`;
    }
  }

  // No tier set — fall back to explicit pixel string or API default
  if (!imageSize || imageSize === '1K') {
    if (explicitSize) return String(explicitSize).replace(/×/g, 'x');
    return undefined; // API defaults to 1024x1024
  }

  const longEdge = imageSize === '4K' ? 3840 : imageSize === '2K' ? 2048 : 1024;

  const [rw, rh] = (resolvedRatio ?? '1:1').split(':').map(Number);
  if (!rw || !rh || isNaN(rw) || isNaN(rh)) return `${longEdge}x${longEdge}`;

  const snap16 = (n: number) => Math.round(n / 16) * 16;

  let w: number, h: number;
  if (rw >= rh) {
    w = longEdge;
    h = snap16(longEdge * rh / rw);
  } else {
    h = longEdge;
    w = snap16(longEdge * rw / rh);
  }

  w = Math.min(w, 3840);
  h = Math.min(h, 3840);

  const maxLong = Math.max(w, h);
  const minShort = Math.min(w, h);
  if (maxLong / minShort > 3) {
    if (w > h) w = snap16(h * 3);
    else h = snap16(w * 3);
  }

  return `${w}x${h}`;
}
