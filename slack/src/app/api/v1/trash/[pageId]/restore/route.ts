import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  await getDefaultUser();
  const { pageId } = await params;

  const page = await db
    .select({ id: blocks.id, parentId: blocks.parentId, archived: blocks.archived })
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
      { object: 'error', status: 400, code: 'already_active', message: 'Page is not archived' },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(blocks)
      .set({ archived: false, updatedAt: new Date() })
      .where(eq(blocks.id, pageId));

    if (page.parentId) {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, page.parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent && !parent.childrenOrder.includes(pageId)) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, pageId] })
          .where(eq(blocks.id, page.parentId));
      }
    }
  });

  return NextResponse.json({ object: 'page', id: pageId, archived: false });
}
