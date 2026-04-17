/**
 * GET  /api/favorites?workspaceId= — current user's favorites in a workspace.
 * POST /api/favorites — body { workspaceId, pageId, position? }. Upsert by (userId, pageId).
 */

import { db } from '@/lib/db';
import { favorites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(favorites)
    .where(and(eq(favorites.userId, auth.user.id), eq(favorites.workspaceId, workspaceId)));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json() as { workspaceId?: string; pageId?: string; position?: number };
  if (!body.workspaceId || !body.pageId) {
    return NextResponse.json({ error: 'workspaceId and pageId are required' }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(favorites)
    .where(and(eq(favorites.userId, auth.user.id), eq(favorites.pageId, body.pageId)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(favorites)
      .set({ position: body.position ?? existing.position })
      .where(eq(favorites.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(favorites)
    .values({
      userId: auth.user.id,
      workspaceId: body.workspaceId,
      pageId: body.pageId,
      position: body.position ?? 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
