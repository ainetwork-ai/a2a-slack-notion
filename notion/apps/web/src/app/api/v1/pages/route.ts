import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { encodeCursor, decodeCursor } from '@/lib/notion/pagination';
import { indexPage } from '@/lib/notion/search';
import type { PaginatedResponse } from '@/lib/notion/pagination';

const CreatePageSchema = z.object({
  title: z.string().default('Untitled'),
  parentId: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
});

export async function GET(request: NextRequest) {
  await getDefaultUser();

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' },
      { status: 400 },
    );
  }

  const startCursorEncoded = url.searchParams.get('start_cursor');
  const pageSizeParam = url.searchParams.get('page_size');
  const usePagination = startCursorEncoded !== null || pageSizeParam !== null;
  const pageSize = Math.min(Number(pageSizeParam ?? 50), 100);

  const cursorId = startCursorEncoded ? decodeCursor(startCursorEncoded) : undefined;

  const baseWhere = and(
    eq(blocks.workspaceId, workspaceId),
    eq(blocks.type, 'page'),
    eq(blocks.archived, false),
    isNull(blocks.parentId),
  );

  let whereClause = baseWhere;
  if (usePagination && cursorId) {
    const cursorRow = await db
      .select({ createdAt: blocks.createdAt })
      .from(blocks)
      .where(eq(blocks.id, cursorId))
      .limit(1)
      .then((r) => r[0]);
    if (cursorRow) {
      whereClause = and(baseWhere, gt(blocks.createdAt, cursorRow.createdAt));
    }
  }

  const rootPagesQuery = db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      createdBy: blocks.createdBy,
      createdAt: blocks.createdAt,
      updatedAt: blocks.updatedAt,
      childrenOrder: blocks.childrenOrder,
    })
    .from(blocks)
    .where(whereClause)
    .orderBy(asc(blocks.createdAt));

  const rootPages = usePagination
    ? await rootPagesQuery.limit(pageSize + 1)
    : await rootPagesQuery;

  const mapped = rootPages.map((p) => ({
    id: p.id,
    ...(p.properties as Record<string, unknown>),
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    hasChildren: p.childrenOrder.length > 0,
  }));

  if (!usePagination) {
    return NextResponse.json(mapped);
  }

  const hasMore = mapped.length > pageSize;
  const results = hasMore ? mapped.slice(0, pageSize) : mapped;
  const lastResult = results[results.length - 1];
  const nextCursor = hasMore && lastResult ? encodeCursor(lastResult.id) : null;

  const response: PaginatedResponse<(typeof results)[number]> = {
    object: 'list',
    results,
    has_more: hasMore,
    next_cursor: nextCursor,
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' },
      { status: 400 },
    );
  }

  const body = await request.json();
  const parsed = CreatePageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { title, parentId, icon, coverUrl } = parsed.data;

  const inserted = await db
    .insert(blocks)
    .values({
      type: 'page',
      parentId: parentId ?? null,
      pageId: workspaceId,
      workspaceId,
      createdBy: user.id,
      properties: { title, icon: icon ?? null, coverUrl: coverUrl ?? null },
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  const updated = await db
    .update(blocks)
    .set({ pageId: inserted.id })
    .where(eq(blocks.id, inserted.id))
    .returning()
    .then((r) => r[0]!);

  if (parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, inserted.id] })
          .where(eq(blocks.id, parentId));
      }
    });
  }

  void indexPage({
    id: updated.id,
    workspaceId,
    title,
    textContent: '',
    createdBy: user.id,
    type: 'page',
    updatedAt: updated.updatedAt.toISOString(),
  });

  return NextResponse.json(
    { id: updated.id, ...(updated.properties as Record<string, unknown>) },
    { status: 201 },
  );
}
