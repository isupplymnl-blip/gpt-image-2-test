import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getGeneratedDir } from '../../../lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const safe = filename.split('/').pop() || filename; // prevent path traversal
    const filepath = join(getGeneratedDir(), safe);
    const buffer = await readFile(filepath);

    const ext = safe.split('.').pop()?.toLowerCase();
    const contentType = ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'webp' ? 'image/webp'
      : 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[Generated Image Serve Error]', error);
    return new NextResponse('Image not found', { status: 404 });
  }
}
