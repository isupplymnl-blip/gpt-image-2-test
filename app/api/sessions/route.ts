import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, unlink } from 'fs/promises';
import { getSessionsDir, getSessionPath } from '../../lib/storage';
import { uid } from '../../lib/chatStore';
import { mkdir, writeFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

export interface StoredSession {
  id: string;
  title: string;
  provider?: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
}

// GET /api/sessions — list all sessions (id, title, updatedAt only — no messages)
export async function GET() {
  try {
    const dir = getSessionsDir();
    await mkdir(dir, { recursive: true });
    const files = await readdir(dir);
    const sessions: Pick<StoredSession, 'id' | 'title' | 'provider' | 'updatedAt' | 'createdAt'>[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(`${dir}/${file}`, 'utf8');
        const s = JSON.parse(raw) as StoredSession;
        sessions.push({ id: s.id, title: s.title, provider: s.provider, updatedAt: s.updatedAt, createdAt: s.createdAt });
      } catch {
        // corrupt file — skip
      }
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/sessions — create new session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { title?: string; provider?: string };
    const dir = getSessionsDir();
    await mkdir(dir, { recursive: true });

    const now = Date.now();
    const session: StoredSession = {
      id: uid(),
      title: body.title ?? 'New chat',
      provider: body.provider,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    await writeFile(getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf8');
    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/sessions?id= — delete a session file
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await unlink(getSessionPath(id)).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
