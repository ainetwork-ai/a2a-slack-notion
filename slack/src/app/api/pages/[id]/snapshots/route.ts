/**
 * GET  /api/pages/:id/snapshots — list snapshots (id, title, createdBy, createdAt, NOT blob).
 *   Supports pagination via ?limit=&cursor= (cursor = last createdAt ISO string).
 *   Requires view access.
 * POST /api/pages/:id/snapshots — create a manual snapshot. Body: { title?, snapshot: base64 }.
 *   Requires edit access.
 */

import { db } from '@/lib/db';
import { pageSnapshots } from '@/lib/db/schema';
import { eq, and, lt, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const cursor = searchParams.get('cursor');

  const conditions = [eq(pageSnapshots.pageId, id)];
  if (cursor) {
    conditions.push(lt(pageSnapshots.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: pageSnapshots.id,
      title: pageSnapshots.title,
      createdBy: pageSnapshots.createdBy,
      createdAt: pageSnapshots.createdAt,
    })
    .from(pageSnapshots)
    .where(and(...conditions))
    .orderBy(desc(pageSnapshots.createdAt))
    .limit(limit);

  const nextCursor = rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
  return NextResponse.json({ snapshots: rows, nextCursor });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { title?: string; snapshot?: string };
  if (!body.snapshot) {
    return NextResponse.json({ error: 'snapshot (base64) is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(pageSnapshots)
    .values({
      pageId: id,
      title: body.title ?? `Snapshot ${new Date().toISOString()}`,
      snapshot: body.snapshot,
      createdBy: auth.user.id,
    })
    .returning({
      id: pageSnapshots.id,
      title: pageSnapshots.title,
      createdBy: pageSnapshots.createdBy,
      createdAt: pageSnapshots.createdAt,
    });

  return NextResponse.json(created, { status: 201 });
}
