import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks as blocksTable, type BlockType } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';
import { appEvents } from '@/lib/notion/events';

const CreateBlockSchema = z.object({
  type: z.string(),
  parentId: z.string().optional(),
  pageId: z.string(),
  workspaceId: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

const VALID_BLOCK_TYPES: readonly BlockType[] = [
  'page', 'text', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'callout',
  'code', 'divider', 'image', 'quote', 'table', 'bookmark', 'file',
  'embed', 'database',
] as const;

export async function GET(request: NextRequest) {
  const user = await getDefaultUser();

  const url = new URL(request.url);
  const pageId = url.searchParams.get('pageId') ?? url.searchParams.get('page_id');
  const parentId = url.searchParams.get('parentId') ?? url.searchParams.get('parent_id');

  if (!pageId && !parentId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'pageId or parentId query param required' },
      { status: 400 },
    );
  }

  if (pageId) {
    const ok = await checkPagePermission(user.id, pageId, 'can_view');
    if (!ok) {
      return NextResponse.json(
        { object: 'error', status: 403, code: 'forbidden', message: 'No permission to view blocks on this page' },
        { status: 403 },
      );
    }
  }

  const conditions: SQL[] = [eq(blocksTable.archived, false)];
  if (pageId) conditions.push(eq(blocksTable.pageId, pageId));
  if (parentId) conditions.push(eq(blocksTable.parentId, parentId));

  const results = await db
    .select()
    .from(blocksTable)
    .where(and(...conditions))
    .orderBy(asc(blocksTable.createdAt));

  const filteredResults = pageId ? results.filter((b) => b.id !== pageId) : results;

  return NextResponse.json({ object: 'list', results: filteredResults });
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { type, parentId, pageId, workspaceId, properties, content } = parsed.data;

  const ok = await checkPagePermission(user.id, pageId, 'can_edit');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'No permission to create blocks on this page' },
      { status: 403 },
    );
  }

  if (!VALID_BLOCK_TYPES.includes(type as BlockType)) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: `Invalid block type: ${type}` },
      { status: 400 },
    );
  }

  const block = await db
    .insert(blocksTable)
    .values({
      type: type as BlockType,
      parentId: parentId ?? null,
      pageId,
      workspaceId,
      createdBy: user.id,
      properties: (properties ?? {}) as Record<string, unknown>,
      content: (content ?? {}) as Record<string, unknown>,
    })
    .returning()
    .then((r) => r[0]!);

  if (parentId) {
    const parent = await db
      .select({ childrenOrder: blocksTable.childrenOrder })
      .from(blocksTable)
      .where(eq(blocksTable.id, parentId))
      .limit(1)
      .then((r) => r[0]);
    if (parent) {
      await db
        .update(blocksTable)
        .set({ childrenOrder: [...parent.childrenOrder, block.id] })
        .where(eq(blocksTable.id, parentId));
    }
  } else {
    // Append to the page block's childrenOrder
    const pageBlock = await db
      .select({ childrenOrder: blocksTable.childrenOrder })
      .from(blocksTable)
      .where(eq(blocksTable.id, pageId))
      .limit(1)
      .then((r) => r[0]);
    if (pageBlock) {
      await db
        .update(blocksTable)
        .set({ childrenOrder: [...pageBlock.childrenOrder, block.id] })
        .where(eq(blocksTable.id, pageId));
    }
  }

  appEvents.emit('block.changed', { blockId: block.id, pageId: block.pageId, updatedBy: user.id });

  return NextResponse.json({ object: 'block', ...block }, { status: 201 });
}
