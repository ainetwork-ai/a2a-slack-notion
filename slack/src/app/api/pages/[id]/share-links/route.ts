/**
 * GET    /api/pages/:id/share-links — list active share links. Requires full_access.
 * POST   /api/pages/:id/share-links — create share link. Body: { level?, isPublic?, expiresAt? }.
 *   Returns { token, url: '/share/' + token }.
 * DELETE /api/pages/:id/share-links — revoke link. Body { token } or ?token=.
 */

import { db } from '@/lib/db';
import { shareLinks } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';
import type { PermissionLevel } from '@/lib/notion/page-access';
import { randomBytes } from 'crypto';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'full_access'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.pageId, id));

  return NextResponse.json(links);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'full_access'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as {
    level?: string;
    isPublic?: boolean;
    expiresAt?: string;
  };

  const validLevels: PermissionLevel[] = ['full_access', 'can_edit', 'can_comment', 'can_view'];
  const level = (body.level ?? 'can_view') as PermissionLevel;
  if (!validLevels.includes(level)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }

  const token = randomBytes(24).toString('hex');
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;

  const [created] = await db
    .insert(shareLinks)
    .values({
      pageId: id,
      token,
      level,
      isPublic: body.isPublic ?? false,
      expiresAt,
    })
    .returning();

  return NextResponse.json({ ...created, url: `/share/${token}` }, { status: 201 });
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

  const { searchParams } = new URL(req.url);
  let token = searchParams.get('token');
  if (!token) {
    const body = await req.json().catch(() => ({})) as { token?: string };
    token = body.token ?? null;
  }

  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  await db
    .delete(shareLinks)
    .where(and(eq(shareLinks.pageId, id), eq(shareLinks.token, token)));

  return NextResponse.json({ success: true });
}
