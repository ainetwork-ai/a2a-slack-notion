import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks, databaseViews, type BlockType } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { encodeCursor, decodeCursor } from '@/lib/notion/pagination';
import {
  AUTO_PROPERTIES,
  applyFilters,
  applySorts,
  enrichRowWithComputedValues,
  syncReverseRelation,
} from '@/lib/notion/databases-helpers';
import type {
  PropertyValue,
  DatabaseBlockProperties,
  DatabaseRowProperties,
  FilterGroup,
  SortRule,
} from '@/lib/notion/shared';
import { checkAutomationsOnCreate } from '@/lib/notion/automation-engine';

const PropertyValueSchema: z.ZodType<PropertyValue> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), value: z.string() }),
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({ type: z.literal('number'), value: z.number().nullable() }),
  z.object({ type: z.literal('select'), value: z.string().nullable() }),
  z.object({ type: z.literal('multi_select'), value: z.array(z.string()) }),
  z.object({
    type: z.literal('date'),
    value: z
      .object({ start: z.string(), end: z.string().optional(), includeTime: z.boolean().optional() })
      .nullable(),
  }),
  z.object({ type: z.literal('person'), value: z.array(z.string()) }),
  z.object({
    type: z.literal('files'),
    value: z.array(z.object({ name: z.string(), url: z.string(), size: z.number().optional() })),
  }),
  z.object({ type: z.literal('checkbox'), value: z.boolean() }),
  z.object({ type: z.literal('url'), value: z.string() }),
  z.object({ type: z.literal('email'), value: z.string() }),
  z.object({ type: z.literal('phone'), value: z.string() }),
  z.object({ type: z.literal('status'), value: z.string().nullable() }),
  z.object({ type: z.literal('relation'), value: z.array(z.string()) }),
  z.object({ type: z.literal('created_time'), value: z.string() }),
  z.object({ type: z.literal('created_by'), value: z.string() }),
  z.object({ type: z.literal('last_edited_time'), value: z.string() }),
  z.object({ type: z.literal('last_edited_by'), value: z.string() }),
]);

const CreateRowSchema = z.object({
  values: z.record(z.string(), PropertyValueSchema).optional().default({}),
  parentRowId: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

  const url = new URL(request.url);
  const viewId = url.searchParams.get('view_id');
  const cursorParam = url.searchParams.get('start_cursor') ?? url.searchParams.get('cursor');
  const cursor = cursorParam
    ? (() => {
        try {
          return decodeCursor(cursorParam);
        } catch {
          return cursorParam;
        }
      })()
    : undefined;
  const pageSize = Math.min(Number(url.searchParams.get('page_size') ?? 50), 100);
  const parentRowId = url.searchParams.get('parent_row_id');
  const includeSubItems = url.searchParams.get('include_sub_items') === 'true';

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

  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;

  let filterGroup: FilterGroup = { logic: 'and', conditions: [] };
  let sorts: SortRule[] = [];
  if (viewId) {
    const view = await db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, viewId))
      .limit(1)
      .then((r) => r[0]);
    if (view) {
      filterGroup = view.filters as unknown as FilterGroup;
      sorts = view.sorts as unknown as SortRule[];
    }
  }

  const allRows = await db
    .select()
    .from(blocks)
    .where(
      and(
        eq(blocks.parentId, databaseId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
      ),
    )
    .orderBy(asc(blocks.createdAt));

  const rowsForParent =
    parentRowId !== null
      ? allRows.filter((r) => {
          const rp = r.properties as unknown as DatabaseRowProperties;
          const storedParent = (rp.values as Record<string, unknown>)?.['__parentRowId'];
          return storedParent === parentRowId;
        })
      : allRows.filter((r) => {
          const rp = r.properties as unknown as DatabaseRowProperties;
          const storedParent = (rp.values as Record<string, unknown>)?.['__parentRowId'];
          return storedParent === undefined || storedParent === null;
        });

  const filtered = applyFilters(rowsForParent, filterGroup, schema);

  const sorted = applySorts(
    filtered as Array<{ id: string; properties: unknown; createdAt: Date }>,
    sorts,
    schema,
  );

  let startIndex = 0;
  if (cursor) {
    const idx = sorted.findIndex((r) => r.id === cursor);
    if (idx !== -1) startIndex = idx + 1;
  }
  const pageRows = sorted.slice(startIndex, startIndex + pageSize);
  const hasMore = pageRows.length === pageSize && startIndex + pageSize < sorted.length;
  const nextCursor =
    hasMore && pageRows[pageRows.length - 1] ? encodeCursor(pageRows[pageRows.length - 1]!.id) : null;

  const enriched = await Promise.all(pageRows.map((row) => enrichRowWithComputedValues(row, schema)));

  type RowWithSubItems = (typeof enriched)[number] & {
    subItems?: typeof enriched;
    parentRowId?: string | null;
  };
  let results: RowWithSubItems[];
  if (includeSubItems) {
    const pageIds = enriched.map((r) => r.id);
    const allSubRows = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.parentId, databaseId),
          eq(blocks.type, 'page'),
          eq(blocks.archived, false),
        ),
      )
      .orderBy(asc(blocks.createdAt));

    const subRowsByParent = new Map<string, typeof allSubRows>();
    for (const sub of allSubRows) {
      const rp = sub.properties as unknown as DatabaseRowProperties;
      const subParentId = (rp.values as Record<string, unknown>)?.['__parentRowId'];
      if (typeof subParentId === 'string' && pageIds.includes(subParentId)) {
        const list = subRowsByParent.get(subParentId) ?? [];
        list.push(sub);
        subRowsByParent.set(subParentId, list);
      }
    }

    results = await Promise.all(
      enriched.map(async (row): Promise<RowWithSubItems> => {
        const subRaw = subRowsByParent.get(row.id) ?? [];
        const subEnriched = await Promise.all(
          subRaw.map((s) => enrichRowWithComputedValues(s, schema)),
        );
        const rp = row.properties as DatabaseRowProperties;
        const pid = (rp.values as Record<string, unknown>)?.['__parentRowId'] ?? null;
        return { ...row, subItems: subEnriched, parentRowId: pid as string | null };
      }),
    );
  } else {
    results = enriched.map((row) => {
      const rp = row.properties as DatabaseRowProperties;
      const pid = (rp.values as Record<string, unknown>)?.['__parentRowId'] ?? null;
      return { ...row, parentRowId: pid as string | null };
    });
  }

  return NextResponse.json({
    object: 'list',
    results,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  const user = await getDefaultUser();
  const { databaseId } = await params;

  const body = await request.json();
  const parsed = CreateRowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

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

  const now = new Date().toISOString();

  const clientValues = parsed.data.values;
  for (const [, val] of Object.entries(clientValues)) {
    if (AUTO_PROPERTIES.includes(val.type as (typeof AUTO_PROPERTIES)[number])) {
      return NextResponse.json(
        {
          object: 'error',
          status: 400,
          code: 'validation_error',
          message: `Property type '${val.type}' is auto-computed and cannot be set by clients`,
        },
        { status: 400 },
      );
    }
  }

  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;

  if (parsed.data.parentRowId) {
    const parentRow = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.id, parsed.data.parentRowId),
          eq(blocks.parentId, databaseId),
          eq(blocks.type, 'page'),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
    if (!parentRow || parentRow.archived) {
      return NextResponse.json(
        {
          object: 'error',
          status: 400,
          code: 'validation_error',
          message: 'Parent row not found in this database',
        },
        { status: 400 },
      );
    }
  }

  for (const [propId, val] of Object.entries(clientValues)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.relatedDatabaseId) {
        const relatedIds = val.value as string[];
        if (relatedIds.length > 0) {
          const found = await db
            .select({ id: blocks.id })
            .from(blocks)
            .where(
              and(
                inArray(blocks.id, relatedIds),
                eq(blocks.parentId, propDef.relation.relatedDatabaseId),
                eq(blocks.archived, false),
              ),
            );
          if (found.length !== relatedIds.length) {
            return NextResponse.json(
              {
                object: 'error',
                status: 400,
                code: 'validation_error',
                message: 'Some relation row ids do not exist in the related database',
              },
              { status: 400 },
            );
          }
        }
      }
    }
  }

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

  const parentRowValue: Record<string, unknown> = parsed.data.parentRowId
    ? { __parentRowId: parsed.data.parentRowId }
    : {};

  const rowProperties: DatabaseRowProperties = {
    values: { ...autoValues, ...clientValues, ...parentRowValue } as Record<string, PropertyValue>,
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

  for (const [propId, val] of Object.entries(clientValues)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.reversePropertyId) {
        const relatedIds = val.value as string[];
        await Promise.all(
          relatedIds.map((relId) =>
            syncReverseRelation(updatedRow.id, relId, propDef.relation!.reversePropertyId!, true),
          ),
        );
      }
    }
  }

  checkAutomationsOnCreate(databaseId, updatedRow.id).catch(() => {});

  return NextResponse.json(
    { ...updatedRow, parentRowId: parsed.data.parentRowId ?? null },
    { status: 201 },
  );
}
