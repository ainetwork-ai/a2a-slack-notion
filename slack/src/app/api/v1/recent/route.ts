import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  recentPages,
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

  const recents = await db
    .select()
    .from(recentPages)
    .where(and(eq(recentPages.userId, user.id), eq(recentPages.workspaceId, workspaceId)))
    .orderBy(desc(recentPages.visitedAt))
    .limit(20);

  const pageIds = recents.map((r) => r.pageId);
  const pages =
    pageIds.length > 0
      ? await db
          .select({ id: blocks.id, properties: blocks.properties })
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
    recents
      .filter((r) => pageMap.has(r.pageId))
      .map((r) => {
        const page = pageMap.get(r.pageId)!;
        const props = (page.properties ?? {}) as Record<string, unknown>;
        return {
          pageId: r.pageId,
          title: props['title'] ?? 'Untitled',
          icon: props['icon'] ?? null,
          visitedAt: r.visitedAt,
        };
      }),
  );
}
