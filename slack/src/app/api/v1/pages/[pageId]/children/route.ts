import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  await getDefaultUser();
  const { pageId } = await params;

  const page = await db
    .select({ childrenOrder: blocks.childrenOrder })
    .from(blocks)
    .where(eq(blocks.id, pageId))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const childPages = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      childrenOrder: blocks.childrenOrder,
      createdAt: blocks.createdAt,
      updatedAt: blocks.updatedAt,
    })
    .from(blocks)
    .where(
      and(
        eq(blocks.parentId, pageId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
      ),
    );

  return NextResponse.json(
    childPages.map((p) => ({
      id: p.id,
      ...(p.properties as Record<string, unknown>),
      hasChildren: p.childrenOrder.length > 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  );
}
