import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { getSessionsDir, getSessionPath } from '../../../lib/storage';
import type { StoredSession } from '../route';

export const dynamic = 'force-dynamic';

async function loadSession(id: string): Promise<StoredSession | null> {
  try {
    const raw = await readFile(getSessionPath(id), 'utf8');
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

// GET /api/sessions/:id — load full session including messages
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSession(id);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json({ session });
}

// PATCH /api/sessions/:id — append or update session fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json() as {
      title?: string;
      provider?: string;
      appendMessages?: unknown[];
    };

    await mkdir(getSessionsDir(), { recursive: true });
    const session = (await loadSession(id)) ?? {
      id,
      title: 'New chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    } as StoredSession;

    if (body.title !== undefined) session.title = body.title;
    if (body.provider !== undefined) session.provider = body.provider;
    if (body.appendMessages?.length) {
      session.messages = [...session.messages, ...body.appendMessages];
    }
    session.updatedAt = Date.now();

    await writeFile(getSessionPath(id), JSON.stringify(session, null, 2), 'utf8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
