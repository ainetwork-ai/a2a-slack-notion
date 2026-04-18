import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks as blocksTable } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';
import { appEvents } from '@/lib/notion/events';

const UpdateBlockSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id } = await params;

  const body = await request.json();
  const parsed = UpdateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Block not found' },
      { status: 404 },
    );
  }

  const ok = await checkPagePermission(user.id, existing.pageId, 'can_edit');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'No permission to edit blocks on this page' },
      { status: 403 },
    );
  }

  const updatedProperties =
    parsed.data.properties !== undefined
      ? { ...(existing.properties as Record<string, unknown>), ...parsed.data.properties }
      : existing.properties;

  const updatedContent =
    parsed.data.content !== undefined
      ? { ...(existing.content as Record<string, unknown>), ...parsed.data.content }
      : existing.content;

  const block = await db
    .update(blocksTable)
    .set({
      properties: updatedProperties as Record<string, unknown>,
      content: updatedContent as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(blocksTable.id, id))
    .returning()
    .then((r) => r[0]!);

  appEvents.emit('block.changed', { blockId: block.id, pageId: block.pageId, updatedBy: user.id });

  return NextResponse.json({ object: 'block', ...block });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id } = await params;

  const existing = await db
    .select()
    .from(blocksTable)
    .where(eq(blocksTable.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Block not found' },
      { status: 404 },
    );
  }

  const ok = await checkPagePermission(user.id, existing.pageId, 'can_edit');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'No permission to delete blocks on this page' },
      { status: 403 },
    );
  }

  await db
    .update(blocksTable)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocksTable.id, id));

  if (existing.parentId) {
    const parent = await db
      .select({ childrenOrder: blocksTable.childrenOrder })
      .from(blocksTable)
      .where(eq(blocksTable.id, existing.parentId))
      .limit(1)
      .then((r) => r[0]);
    if (parent) {
      await db
        .update(blocksTable)
        .set({ childrenOrder: parent.childrenOrder.filter((cid) => cid !== id) })
        .where(eq(blocksTable.id, existing.parentId));
    }
  }

  return NextResponse.json({ object: 'block', id, archived: true });
}
