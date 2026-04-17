/**
 * PATCH  /api/comments/:id — body { content?, resolved? }.
 *   Author-only edit OR anyone-with-edit can toggle `resolved`.
 * DELETE /api/comments/:id — author-only or full_access.
 */

import { db } from '@/lib/db';
import { blockComments, blocks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';

async function getCommentWithPage(commentId: string) {
  const [comment] = await db
    .select()
    .from(blockComments)
    .where(eq(blockComments.id, commentId))
    .limit(1);
  if (!comment) return null;

  const [block] = await db
    .select()
    .from(blocks)
    .where(eq(blocks.id, comment.blockId))
    .limit(1);
  if (!block) return null;

  const page = await getPage(block.pageId);
  return page ? { comment, page } : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const ctx = await getCommentWithPage(id);
  if (!ctx) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  const { comment, page } = ctx;

  const isAuthor = comment.authorId === auth.user.id;
  const canEdit = await canAccess(auth.user.id, page, 'edit');

  if (!isAuthor && !canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { content?: unknown; resolved?: boolean };

  const updates: Partial<typeof blockComments.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  // Only the author may update content
  if (body.content !== undefined) {
    if (!isAuthor) {
      return NextResponse.json({ error: 'Only the author may edit content' }, { status: 403 });
    }
    updates.content = body.content;
  }

  // Anyone with edit access (or the author) may toggle resolved
  if (body.resolved !== undefined) {
    if (!isAuthor && !canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    updates.resolved = body.resolved;
  }

  const [updated] = await db
    .update(blockComments)
    .set(updates)
    .where(eq(blockComments.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const ctx = await getCommentWithPage(id);
  if (!ctx) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  const { comment, page } = ctx;

  const isAuthor = comment.authorId === auth.user.id;
  const hasFullAccess = await canAccess(auth.user.id, page, 'full_access');

  if (!isAuthor && !hasFullAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(blockComments).where(eq(blockComments.id, id));
  return NextResponse.json({ success: true });
}
