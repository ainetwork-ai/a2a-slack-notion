import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

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

  const archivedPages = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      parentId: blocks.parentId,
      updatedAt: blocks.updatedAt,
    })
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, true),
      ),
    )
    .orderBy(desc(blocks.updatedAt));

  return NextResponse.json(
    archivedPages.map((p) => {
      const props = (p.properties ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        title: (props['title'] as string) ?? 'Untitled',
        icon: (props['icon'] as string | null) ?? null,
        parentId: p.parentId,
        archivedAt: p.updatedAt,
      };
    }),
  );
}
