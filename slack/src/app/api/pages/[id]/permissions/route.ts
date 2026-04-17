/**
 * GET  /api/pages/:id/permissions — list permissions for a page. Requires view access.
 * PUT  /api/pages/:id/permissions — upsert { userId, level }. Requires full_access or workspace admin.
 * DELETE /api/pages/:id/permissions — body { userId }. Revokes permission. Requires full_access.
 */

import { db } from '@/lib/db';
import { pagePermissions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess, isWorkspaceAdmin } from '@/lib/notion/page-access';
import type { PermissionLevel } from '@/lib/notion/page-access';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const perms = await db
    .select()
    .from(pagePermissions)
    .where(eq(pagePermissions.pageId, id));

  return NextResponse.json(perms);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  const hasFullAccess = await canAccess(auth.user.id, page, 'full_access');
  const isAdmin = await isWorkspaceAdmin(auth.user.id, page);
  if (!hasFullAccess && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { userId?: string; level?: string };
  if (!body.userId || !body.level) {
    return NextResponse.json({ error: 'userId and level are required' }, { status: 400 });
  }

  const validLevels: PermissionLevel[] = ['full_access', 'can_edit', 'can_comment', 'can_view'];
  if (!validLevels.includes(body.level as PermissionLevel)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, id), eq(pagePermissions.userId, body.userId)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(pagePermissions)
      .set({ level: body.level as PermissionLevel })
      .where(eq(pagePermissions.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(pagePermissions)
    .values({ pageId: id, userId: body.userId, level: body.level as PermissionLevel })
    .returning();
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'full_access'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  await db
    .delete(pagePermissions)
    .where(and(eq(pagePermissions.pageId, id), eq(pagePermissions.userId, body.userId)));

  return NextResponse.json({ success: true });
}
