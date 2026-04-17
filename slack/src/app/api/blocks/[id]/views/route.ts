/**
 * POST /api/blocks/:id/views
 *
 * Create a new view for a database block.
 *
 * Body: { name, type, filters?, sorts?, groupBy?, config? }
 * Requires edit access on the database's parent page.
 *
 * Returns the created databaseViews row.
 */

import { db } from '@/lib/db';
import { blocks, databaseViews } from '@/lib/db/schema';
import type { ViewType } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';

const VALID_VIEW_TYPES = new Set<ViewType>([
  'table',
  'board',
  'list',
  'calendar',
  'gallery',
  'timeline',
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { id } = await params;

  // Fetch the database block
  const [dbBlock] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!dbBlock) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }
  if (dbBlock.type !== 'database') {
    return NextResponse.json({ error: 'Block is not a database' }, { status: 400 });
  }

  // Access check: requires edit on the parent page
  const page = await getPage(dbBlock.pageId);
  if (!page) {
    return NextResponse.json({ error: 'Parent page not found' }, { status: 404 });
  }
  if (!(await canAccess(auth.user.id, page, 'edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as {
    name?: unknown;
    type?: unknown;
    filters?: unknown;
    sorts?: unknown;
    groupBy?: unknown;
    config?: unknown;
  };

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const viewType: ViewType =
    typeof body.type === 'string' && VALID_VIEW_TYPES.has(body.type as ViewType)
      ? (body.type as ViewType)
      : 'table';

  // Determine position (append after existing views)
  const existingViews = await db
    .select({ position: databaseViews.position })
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, id));

  const maxPosition = existingViews.reduce((max, v) => Math.max(max, v.position), -1);

  const [created] = await db
    .insert(databaseViews)
    .values({
      databaseId: id,
      name: body.name,
      type: viewType,
      filters: (body.filters as { logic: 'and' | 'or'; conditions: unknown[] }) ??
        { logic: 'and', conditions: [] },
      sorts: (body.sorts as unknown[]) ?? [],
      groupBy: body.groupBy ?? null,
      config: (body.config as { visibleProperties: string[] }) ??
        { visibleProperties: [] },
      position: maxPosition + 1,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
