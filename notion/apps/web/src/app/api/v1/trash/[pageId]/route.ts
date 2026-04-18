import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  await getDefaultUser();
  const { pageId } = await params;

  const page = await db
    .select({ id: blocks.id, archived: blocks.archived, parentId: blocks.parentId })
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

  if (!page.archived) {
    return NextResponse.json(
      {
        object: 'error',
        status: 400,
        code: 'not_in_trash',
        message: 'Page must be in trash before permanent deletion. Archive it first.',
      },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    const toVisit: string[] = [pageId];
    const allDescendants: string[] = [pageId];
    while (toVisit.length > 0) {
      const parent = toVisit.shift()!;
      const children = await tx
        .select({ id: blocks.id })
        .from(blocks)
        .where(eq(blocks.parentId, parent));
      for (const ch of children) {
        allDescendants.push(ch.id);
        toVisit.push(ch.id);
      }
    }
    for (const id of allDescendants.reverse()) {
      await tx.delete(blocks).where(eq(blocks.id, id));
    }
  });

  return NextResponse.json({ object: 'page', id: pageId, deleted: true });
}
