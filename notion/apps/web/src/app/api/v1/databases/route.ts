import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  blocks,
  databaseViews,
  type ViewType as DbViewType,
} from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type {
  PropertyDefinition,
  PropertyType,
  DatabaseSchema,
  DatabaseBlockProperties,
} from '@notion/shared';
import { buildDefaultViewConfig } from '@/lib/notion/databases-helpers';

const SelectOptionSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  color: z.string().default('default'),
});

const StatusGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  optionIds: z.array(z.string()),
});

const PropertyDefinitionSchema = z.object({
  name: z.string(),
  type: z.enum([
    'title', 'text', 'number', 'select', 'multi_select', 'date', 'person',
    'files', 'checkbox', 'url', 'email', 'phone', 'status',
    'formula', 'relation', 'rollup',
    'created_time', 'created_by', 'last_edited_time', 'last_edited_by',
  ] as [PropertyType, ...PropertyType[]]),
  options: z.array(SelectOptionSchema).optional(),
  numberFormat: z.enum(['number', 'number_with_commas', 'percent', 'dollar', 'euro', 'won', 'yen']).optional(),
  statusGroups: z.array(StatusGroupSchema).optional(),
  formula: z.object({ expression: z.string() }).optional(),
  relation: z
    .object({
      relatedDatabaseId: z.string(),
      reversePropertyId: z.string().optional(),
    })
    .optional(),
  rollup: z
    .object({
      relationPropertyId: z.string(),
      targetPropertyId: z.string(),
      function: z.enum([
        'count', 'count_values', 'sum', 'avg', 'min', 'max', 'median',
        'range', 'percent_empty', 'percent_not_empty', 'show_original', 'show_unique',
      ]),
    })
    .optional(),
});

const CreateDatabaseSchema = z.object({
  title: z.string().default('Untitled'),
  parentId: z.string().optional(),
  workspaceId: z.string(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  schema: z
    .object({
      properties: z.array(PropertyDefinitionSchema).optional().default([]),
    })
    .optional()
    .default({ properties: [] }),
});

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateDatabaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { title, parentId, workspaceId, icon, coverUrl, schema } = parsed.data;

  const titleProp: PropertyDefinition = {
    id: randomUUID(),
    name: 'Name',
    type: 'title',
  };

  const extraProps: PropertyDefinition[] = (schema.properties ?? [])
    .filter((p) => p.type !== 'title')
    .map((p) => ({
      id: randomUUID(),
      name: p.name,
      type: p.type,
      ...(p.options ? { options: p.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color })) } : {}),
      ...(p.numberFormat ? { numberFormat: p.numberFormat } : {}),
      ...(p.statusGroups ? { statusGroups: p.statusGroups } : {}),
    }));

  const allProperties: PropertyDefinition[] = [titleProp, ...extraProps];
  const dbSchema: DatabaseSchema = { properties: allProperties };

  const dbProperties: DatabaseBlockProperties = {
    title,
    icon: icon ?? null,
    coverUrl: coverUrl ?? null,
    schema: dbSchema,
  };

  const dbBlock = await db
    .insert(blocks)
    .values({
      type: 'database',
      parentId: parentId ?? null,
      pageId: workspaceId,
      workspaceId,
      createdBy: user.id,
      properties: dbProperties as unknown as Record<string, unknown>,
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  const updatedBlock = await db
    .update(blocks)
    .set({ pageId: dbBlock.id })
    .where(eq(blocks.id, dbBlock.id))
    .returning()
    .then((r) => r[0]!);

  if (parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, dbBlock.id] })
          .where(eq(blocks.id, parentId));
      }
    });
  }

  const defaultViewConfig = buildDefaultViewConfig(allProperties);
  const view = await db
    .insert(databaseViews)
    .values({
      databaseId: dbBlock.id,
      name: 'Default View',
      type: 'table' as DbViewType,
      filters: { logic: 'and', conditions: [] },
      sorts: [],
      config: defaultViewConfig,
      position: 0,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(
    { ...updatedBlock, properties: updatedBlock.properties, view },
    { status: 201 },
  );
}
