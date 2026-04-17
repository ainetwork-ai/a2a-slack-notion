/**
 * GET /api/pages/:id — fetch page metadata (root block of type='page') + children.
 * PATCH /api/pages/:id — update page properties (title, icon, cover, archived).
 * DELETE /api/pages/:id — cascade delete (sets archived=true; hard delete via ?hard=1).
 *
 * Authorization: caller must have view/edit access via pagePermissions OR workspace membership.
 */

import { db } from '@/lib/db';
import { blocks, pagePermissions, workspaceMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

async function canAccess(
  userId: string,
  page: typeof blocks.$inferSelect,
  level: 'view' | 'edit' = 'view'
): Promise<boolean> {
  const [perm] = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, page.id), eq(pagePermissions.userId, userId)))
    .limit(1);

  if (perm) {
    if (level === 'view') return true;
    return perm.level === 'full_access' || perm.level === 'can_edit';
  }

  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, page.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const [page] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!page || page.type !== 'page') {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  if (!(await canAccess(auth.user.id, page, 'view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const children = await db.select().from(blocks).where(eq(blocks.pageId, id));
  return NextResponse.json({ page, blocks: children });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const [page] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!page || page.type !== 'page') {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  if (!(await canAccess(auth.user.id, page, 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const propertyUpdates: Record<string, unknown> = { ...(page.properties as object) };
  if (body.title !== undefined) propertyUpdates.title = body.title;
  if (body.icon !== undefined) propertyUpdates.icon = body.icon;
  if (body.cover !== undefined) propertyUpdates.cover = body.cover;

  const [updated] = await db
    .update(blocks)
    .set({
      properties: propertyUpdates,
      archived: body.archived ?? page.archived,
      updatedAt: new Date(),
    })
    .where(eq(blocks.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const hard = searchParams.get('hard') === '1';

  const [page] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!page || page.type !== 'page') {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  if (!(await canAccess(auth.user.id, page, 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (hard) {
    // ON DELETE CASCADE removes children + permissions + snapshots
    await db.delete(blocks).where(eq(blocks.id, id));
  } else {
    await db.update(blocks).set({ archived: true, updatedAt: new Date() }).where(eq(blocks.id, id));
  }

  return NextResponse.json({ success: true });
}
