import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pageSnapshots, blocks } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'can_view');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const cursorParam = url.searchParams.get('cursor');
  const limit = Math.min(Number(limitParam ?? 20), 100);

  const baseWhere = eq(pageSnapshots.pageId, pageId);

  let whereClause = baseWhere;
  if (cursorParam) {
    const cursorRow = await db
      .select({ createdAt: pageSnapshots.createdAt })
      .from(pageSnapshots)
      .where(eq(pageSnapshots.id, cursorParam))
      .limit(1)
      .then((r) => r[0]);
    if (cursorRow) {
      whereClause = and(baseWhere, lt(pageSnapshots.createdAt, cursorRow.createdAt))!;
    }
  }

  const snapshots = await db
    .select({
      id: pageSnapshots.id,
      pageId: pageSnapshots.pageId,
      title: pageSnapshots.title,
      createdBy: pageSnapshots.createdBy,
      createdAt: pageSnapshots.createdAt,
    })
    .from(pageSnapshots)
    .where(whereClause)
    .orderBy(desc(pageSnapshots.createdAt))
    .limit(limit + 1);

  const hasMore = snapshots.length > limit;
  const items = hasMore ? snapshots.slice(0, limit) : snapshots;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return NextResponse.json({
    object: 'list',
    results: items,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'can_edit');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const page = await db
    .select({ properties: blocks.properties, content: blocks.content })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const content = (page.content ?? {}) as Record<string, unknown>;
  const title = (props['title'] as string) ?? 'Untitled';
  const yjsSnapshot = content['yjsSnapshot'];

  const snapshotB64 =
    yjsSnapshot && typeof yjsSnapshot === 'string'
      ? yjsSnapshot
      : Buffer.alloc(0).toString('base64');

  const body = await _request.json().catch(() => ({}));
  const label = (body as Record<string, unknown>)['label'] as string | undefined;

  const created = await db
    .insert(pageSnapshots)
    .values({
      pageId,
      title: label ? `${title} — ${label}` : title,
      snapshot: snapshotB64,
      createdBy: user.id,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(
    {
      id: created.id,
      pageId: created.pageId,
      title: created.title,
      createdBy: created.createdBy,
      createdAt: created.createdAt,
    },
    { status: 201 },
  );
}
