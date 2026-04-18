import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  blocks,
  databaseTemplates,
  type BlockType,
} from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type {
  DatabaseBlockProperties,
  DatabaseRowProperties,
  PropertyValue,
} from '@notion/shared';
import { checkAutomationsOnCreate } from '@/lib/notion/automation-engine';

type TemplateBlockItem = {
  type: string;
  properties: Record<string, unknown>;
  content: Record<string, unknown>;
  children?: TemplateBlockItem[];
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; tid: string }> },
) {
  const user = await getDefaultUser();
  const { databaseId, tid } = await params;

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Database not found' },
      { status: 404 },
    );
  }

  const template = await db
    .select()
    .from(databaseTemplates)
    .where(and(eq(databaseTemplates.id, tid), eq(databaseTemplates.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!template) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Template not found' },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;

  const autoValues: Record<string, PropertyValue> = {};
  for (const prop of schema.properties) {
    if (prop.type === 'created_time') {
      autoValues[prop.id] = { type: 'created_time', value: now };
    } else if (prop.type === 'created_by') {
      autoValues[prop.id] = { type: 'created_by', value: user.id };
    } else if (prop.type === 'last_edited_time') {
      autoValues[prop.id] = { type: 'last_edited_time', value: now };
    } else if (prop.type === 'last_edited_by') {
      autoValues[prop.id] = { type: 'last_edited_by', value: user.id };
    }
  }

  const templateValues = template.values as unknown as Record<string, PropertyValue>;

  const rowProperties: DatabaseRowProperties = {
    values: { ...autoValues, ...templateValues } as Record<string, PropertyValue>,
  };

  const row = await db
    .insert(blocks)
    .values({
      type: 'page' as BlockType,
      parentId: databaseId,
      pageId: databaseId,
      workspaceId: dbBlock.workspaceId,
      createdBy: user.id,
      properties: rowProperties as unknown as Record<string, unknown>,
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  const updatedRow = await db
    .update(blocks)
    .set({ pageId: row.id })
    .where(eq(blocks.id, row.id))
    .returning()
    .then((r) => r[0]!);

  await db.transaction(async (tx) => {
    const currentDb = await tx
      .select({ childrenOrder: blocks.childrenOrder })
      .from(blocks)
      .where(eq(blocks.id, databaseId))
      .limit(1)
      .then((r) => r[0]);
    if (currentDb) {
      await tx
        .update(blocks)
        .set({ childrenOrder: [...currentDb.childrenOrder, row.id] })
        .where(eq(blocks.id, databaseId));
    }
  });

  const contentBlocks = template.content as unknown as TemplateBlockItem[];
  const workspaceId = dbBlock.workspaceId;
  const createdBy = user.id;

  async function createContentBlocks(
    blocksList: TemplateBlockItem[],
    parentBlockId: string,
  ): Promise<void> {
    for (const blockDef of blocksList) {
      const childBlock = await db
        .insert(blocks)
        .values({
          type: blockDef.type as BlockType,
          parentId: parentBlockId,
          pageId: updatedRow.id,
          workspaceId,
          createdBy,
          properties: (blockDef.properties ?? {}) as Record<string, unknown>,
          content: (blockDef.content ?? {}) as Record<string, unknown>,
        })
        .returning()
        .then((r) => r[0]!);

      const parentBlock = await db
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentBlockId))
        .limit(1)
        .then((r) => r[0]);
      if (parentBlock) {
        await db
          .update(blocks)
          .set({ childrenOrder: [...parentBlock.childrenOrder, childBlock.id] })
          .where(eq(blocks.id, parentBlockId));
      }

      if (blockDef.children && blockDef.children.length > 0) {
        await createContentBlocks(blockDef.children, childBlock.id);
      }
    }
  }

  if (contentBlocks.length > 0) {
    await createContentBlocks(contentBlocks, updatedRow.id);
  }

  checkAutomationsOnCreate(databaseId, updatedRow.id).catch(() => {});

  return NextResponse.json({ ...updatedRow, parentRowId: null }, { status: 201 });
}
