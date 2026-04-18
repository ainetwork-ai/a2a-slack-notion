import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  await getDefaultUser();
  const { pageId } = await params;

  const ancestors: { id: string; title: string; icon: string | null }[] = [];

  let currentId: string | null = pageId;
  while (currentId) {
    const block: { id: string; properties: unknown; parentId: string | null; type: string } | undefined =
      await db
        .select({
          id: blocks.id,
          properties: blocks.properties,
          parentId: blocks.parentId,
          type: blocks.type,
        })
        .from(blocks)
        .where(eq(blocks.id, currentId))
        .limit(1)
        .then((r) => r[0]);

    if (!block || block.type !== 'page') break;
    const props = (block.properties ?? {}) as Record<string, unknown>;
    ancestors.unshift({
      id: block.id,
      title: (props['title'] as string) ?? 'Untitled',
      icon: (props['icon'] as string) ?? null,
    });
    currentId = block.parentId;
  }

  return NextResponse.json(ancestors);
}
