/**
 * GET  /api/pages/:id/tiptap-doc  — fetch the stored Tiptap JSON doc
 * PATCH /api/pages/:id/tiptap-doc — persist the Tiptap JSON doc (debounced autosave)
 *
 * The full Tiptap JSON document is stored in blocks.content.tiptapDoc (JSONB).
 * This replaces the previous Yjs/Hocuspocus persistence path.
 */

import { db } from '@/lib/db';
import { blocks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const page = await getPage(id);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  if (!(await canAccess(auth.user.id, page, 'view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const content = (page.content ?? {}) as Record<string, unknown>;
  const tiptapDoc = content['tiptapDoc'] ?? null;

  return NextResponse.json({ doc: tiptapDoc });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const page = await getPage(id);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  if (!(await canAccess(auth.user.id, page, 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as { doc: Record<string, unknown>; updatedAt?: string };
  if (!body.doc || typeof body.doc !== 'object') {
    return NextResponse.json({ error: 'Invalid doc' }, { status: 400 });
  }

  const existingContent = (page.content ?? {}) as Record<string, unknown>;
  const updatedContent: Record<string, unknown> = {
    ...existingContent,
    tiptapDoc: body.doc,
  };

  await db
    .update(blocks)
    .set({ content: updatedContent, updatedAt: new Date() })
    .where(eq(blocks.id, id));

  return NextResponse.json({ ok: true });
}
