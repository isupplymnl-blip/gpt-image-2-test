import { NextRequest, NextResponse } from 'next/server';
// @ts-expect-error — heic-convert ships no types
import heicConvert from 'heic-convert';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_DIM = 2048;
const JPEG_QUALITY = 85;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const inputSize = buf.length;

    // HEIC → raw JPEG (heic-convert outputs JPEG/PNG; JPEG keeps file small)
    const jpegRaw = await heicConvert({
      buffer: buf as unknown as ArrayBufferLike,
      format: 'JPEG',
      quality: 0.95,
    });

    // sharp pass: cap longest edge at 2048px, re-encode JPEG q=85.
    // Phone HEICs are typically 4032x3024 — this cuts ~10x.
    const out = await sharp(Buffer.from(jpegRaw))
      .rotate() // honor EXIF orientation
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    console.log(`[convert-heic] ${(inputSize/1024).toFixed(0)}KB → ${(out.length/1024).toFixed(0)}KB`);

    return new Response(out, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[convert-heic] error:', msg, err);
    return NextResponse.json({ error: `HEIC conversion failed: ${msg}` }, { status: 500 });
  }
}
