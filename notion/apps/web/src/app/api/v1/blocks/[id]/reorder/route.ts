import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks as blocksTable } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

const ReorderSchema = z.object({
  blockId: z.string(),
  afterId: z.string().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id: parentId } = await params;

  // Resolve pageId from the parent block to check permission
  const parentBlock = await db
    .select({ pageId: blocksTable.pageId })
    .from(blocksTable)
    .where(eq(blocksTable.id, parentId))
    .limit(1)
    .then((r) => r[0]);

  if (parentBlock) {
    const ok = await checkPagePermission(user.id, parentBlock.pageId, 'can_edit');
    if (!ok) {
      return NextResponse.json(
        { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
        { status: 403 },
      );
    }
  }

  const body = await request.json();
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { blockId, afterId } = parsed.data;

  type ReorderError = { ok: false; status: 400 | 404; code: string; message: string };
  type ReorderOk = { ok: true; childrenOrder: string[] };

  const result: ReorderError | ReorderOk = await db.transaction(async (tx) => {
    const parent = await tx
      .select({ childrenOrder: blocksTable.childrenOrder })
      .from(blocksTable)
      .where(eq(blocksTable.id, parentId))
      .limit(1)
      .then((r) => r[0]);

    if (!parent) {
      return { ok: false, status: 404, code: 'not_found', message: 'Parent block not found' } as const;
    }

    const order = [...parent.childrenOrder];

    if (!order.includes(blockId)) {
      return { ok: false, status: 400, code: 'validation_error', message: 'blockId is not in childrenOrder' } as const;
    }

    const filtered = order.filter((id) => id !== blockId);

    let newOrder: string[];
    if (afterId === null) {
      newOrder = [blockId, ...filtered];
    } else {
      const afterIndex = filtered.indexOf(afterId);
      if (afterIndex === -1) {
        newOrder = [...filtered, blockId];
      } else {
        newOrder = [
          ...filtered.slice(0, afterIndex + 1),
          blockId,
          ...filtered.slice(afterIndex + 1),
        ];
      }
    }

    await tx
      .update(blocksTable)
      .set({ childrenOrder: newOrder })
      .where(eq(blocksTable.id, parentId));

    return { ok: true, childrenOrder: newOrder } as const;
  });

  if (!result.ok) {
    return NextResponse.json(
      { object: 'error', status: result.status, code: result.code, message: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json({ object: 'block', id: parentId, childrenOrder: result.childrenOrder });
}
