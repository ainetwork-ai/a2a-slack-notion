/**
 * GET  /api/recent-pages?workspaceId=&limit= — current user's recent pages, visitedAt DESC.
 * POST /api/recent-pages body { workspaceId, pageId } — upsert by (userId, pageId), updates visitedAt=now().
 */

import { db } from '@/lib/db';
import { recentPages } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
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
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  const rows = await db
    .select()
    .from(recentPages)
    .where(and(eq(recentPages.userId, auth.user.id), eq(recentPages.workspaceId, workspaceId)))
    .orderBy(desc(recentPages.visitedAt))
    .limit(limit);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json() as { workspaceId?: string; pageId?: string };
  if (!body.workspaceId || !body.pageId) {
    return NextResponse.json({ error: 'workspaceId and pageId are required' }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(recentPages)
    .where(and(eq(recentPages.userId, auth.user.id), eq(recentPages.pageId, body.pageId)))
    .limit(1);

  const now = new Date();

  if (existing) {
    const [updated] = await db
      .update(recentPages)
      .set({ visitedAt: now })
      .where(eq(recentPages.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [created] = await db
    .insert(recentPages)
    .values({
      userId: auth.user.id,
      workspaceId: body.workspaceId,
      pageId: body.pageId,
      visitedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
