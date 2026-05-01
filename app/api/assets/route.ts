import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getAssetsDbPath } from '../../lib/storage';

interface AssetRecord {
  id: string;
  name: string;
  url: string;
  tags: string[];
  createdAt: string;
}

async function readAssets(): Promise<AssetRecord[]> {
  try {
    return JSON.parse(await readFile(getAssetsDbPath(), 'utf-8')) as AssetRecord[];
  } catch {
    return [];
  }
}

async function writeAssets(assets: AssetRecord[]): Promise<void> {
  const dbPath = getAssetsDbPath();
  await mkdir(path.dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(assets, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const raw = await readFile(getAssetsDbPath(), 'utf-8');
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { imageData, imageUrl, name, tags } = await request.json() as {
      imageData?: string;
      imageUrl?: string;
      name?: string;
      tags?: string[];
    };

    if ((!imageData && !imageUrl) || !name) {
      return NextResponse.json(
        { error: 'imageData or imageUrl, and name are required' },
        { status: 400 }
      );
    }

    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    let assetUrl: string;

    if (imageUrl) {
      // Already-saved file — just register it, no copy needed
      assetUrl = imageUrl;
    } else {
      const filename = `${id}.png`;
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'assets');
      await mkdir(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, filename);
      const base64Data = imageData!.replace(/^data:image\/\w+;base64,/, '');
      await writeFile(filePath, Buffer.from(base64Data, 'base64'));
      assetUrl = `/uploads/assets/${filename}`;
    }

    const asset: AssetRecord = {
      id,
      name: name.trim(),
      url: assetUrl,
      tags: (tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean),
      createdAt: new Date().toISOString(),
    };

    const assets = await readAssets();
    assets.push(asset);
    await writeAssets(assets);

    return NextResponse.json({
      success: true,
      assetId: asset.id,
      url: asset.url,
      message: `Asset "${name}" saved successfully`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/assets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
