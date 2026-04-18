import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  favorites as favoritesTable,
  blocks,
} from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(request: NextRequest) {
  const user = await getDefaultUser();

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' },
      { status: 400 },
    );
  }

  const favs = await db
    .select()
    .from(favoritesTable)
    .where(
      and(eq(favoritesTable.userId, user.id), eq(favoritesTable.workspaceId, workspaceId)),
    )
    .orderBy(asc(favoritesTable.position));

  const pageIds = favs.map((f) => f.pageId);
  const pages =
    pageIds.length > 0
      ? await db
          .select({
            id: blocks.id,
            properties: blocks.properties,
            childrenOrder: blocks.childrenOrder,
          })
          .from(blocks)
          .where(
            and(
              inArray(blocks.id, pageIds),
              eq(blocks.type, 'page'),
              eq(blocks.archived, false),
            ),
          )
      : [];

  const pageMap = new Map(pages.map((p) => [p.id, p]));

  return NextResponse.json(
    favs.map((f) => {
      const page = pageMap.get(f.pageId);
      const props = (page?.properties ?? {}) as Record<string, unknown>;
      return {
        id: f.id,
        pageId: f.pageId,
        title: props['title'] ?? 'Untitled',
        icon: props['icon'] ?? null,
        hasChildren: (page?.childrenOrder.length ?? 0) > 0,
      };
    }),
  );
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const { pageId, workspaceId } = await request.json();
  if (!pageId || !workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'pageId and workspaceId required' },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(favoritesTable)
    .where(and(eq(favoritesTable.userId, user.id), eq(favoritesTable.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (existing) {
    return NextResponse.json(existing, { status: 201 });
  }

  const maxPos = await db
    .select({ position: favoritesTable.position })
    .from(favoritesTable)
    .where(
      and(eq(favoritesTable.userId, user.id), eq(favoritesTable.workspaceId, workspaceId)),
    )
    .orderBy(desc(favoritesTable.position))
    .limit(1)
    .then((r) => r[0]);

  const fav = await db
    .insert(favoritesTable)
    .values({
      userId: user.id,
      workspaceId,
      pageId,
      position: (maxPos?.position ?? 0) + 1,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(fav, { status: 201 });
}
