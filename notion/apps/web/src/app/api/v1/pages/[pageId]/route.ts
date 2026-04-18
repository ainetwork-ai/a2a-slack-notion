import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks, recentPages } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';
import { indexPage } from '@/lib/notion/search';

const UpdatePageSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  archived: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
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

  const page = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page || page.archived) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const children = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.parentId, pageId), eq(blocks.archived, false)))
    .orderBy(asc(blocks.createdAt));

  const ordered =
    page.childrenOrder.length > 0
      ? page.childrenOrder.map((id) => children.find((ch) => ch.id === id)).filter(Boolean)
      : children;

  const existingRecent = await db
    .select()
    .from(recentPages)
    .where(and(eq(recentPages.userId, user.id), eq(recentPages.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (existingRecent) {
    await db
      .update(recentPages)
      .set({ visitedAt: new Date() })
      .where(eq(recentPages.id, existingRecent.id));
  } else {
    await db.insert(recentPages).values({
      userId: user.id,
      workspaceId: page.workspaceId,
      pageId,
    });
  }

  return NextResponse.json({
    ...page,
    ...(page.properties as Record<string, unknown>),
    children: ordered,
  });
}

export async function PATCH(
  request: NextRequest,
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

  const body = await request.json();
  const parsed = UpdatePageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const props = (existing.properties ?? {}) as Record<string, unknown>;
  const updatedProps = { ...props };
  if (parsed.data.title !== undefined) updatedProps['title'] = parsed.data.title;
  if (parsed.data.icon !== undefined) updatedProps['icon'] = parsed.data.icon;
  if (parsed.data.coverUrl !== undefined) updatedProps['coverUrl'] = parsed.data.coverUrl;

  const page = await db
    .update(blocks)
    .set({
      properties: updatedProps,
      archived: parsed.data.archived ?? existing.archived,
      updatedAt: new Date(),
    })
    .where(eq(blocks.id, pageId))
    .returning()
    .then((r) => r[0]!);

  if (parsed.data.title !== undefined) {
    void indexPage({
      id: page.id,
      workspaceId: existing.workspaceId,
      title: parsed.data.title,
      textContent: '',
      createdBy: existing.createdBy,
      type: 'page',
      updatedAt: page.updatedAt.toISOString(),
    });
  }

  return NextResponse.json({
    id: page.id,
    ...(page.properties as Record<string, unknown>),
    archived: page.archived,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'full_access');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  await db
    .update(blocks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocks.id, pageId));

  if (existing.parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, existing.parentId!))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: parent.childrenOrder.filter((id) => id !== pageId) })
          .where(eq(blocks.id, existing.parentId!));
      }
    });
  }

  return NextResponse.json({ object: 'page', id: pageId, archived: true });
}
