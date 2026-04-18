import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { AUTO_PROPERTIES, syncReverseRelation } from '@/lib/notion/databases-helpers';
import type {
  PropertyValue,
  DatabaseBlockProperties,
  DatabaseRowProperties,
} from '@notion/shared';
import { checkAutomations } from '@/lib/notion/automation-engine';

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

const UpdateRowSchema = z.object({
  values: z.record(z.string(), PropertyValueSchema),
  parentRowId: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; rowId: string }> },
) {
  const user = await getDefaultUser();
  const { databaseId, rowId } = await params;

  const body = await request.json();
  const parsed = UpdateRowSchema.safeParse(body);
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

  const row = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, rowId), eq(blocks.parentId, databaseId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);
  if (!row || row.archived) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Row not found' },
      { status: 404 },
    );
  }

  for (const [, val] of Object.entries(parsed.data.values)) {
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

  const now = new Date().toISOString();
  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;
  const existingRowProps = row.properties as unknown as DatabaseRowProperties;

  for (const [propId, val] of Object.entries(parsed.data.values)) {
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

  const autoUpdates: Record<string, PropertyValue> = {};
  for (const prop of schema.properties) {
    if (prop.type === 'last_edited_time') {
      autoUpdates[prop.id] = { type: 'last_edited_time', value: now };
    } else if (prop.type === 'last_edited_by') {
      autoUpdates[prop.id] = { type: 'last_edited_by', value: user.id };
    }
  }

  const parentRowUpdate: Record<string, unknown> = {};
  if (parsed.data.parentRowId !== undefined) {
    if (parsed.data.parentRowId === null) {
      const existingValues = { ...existingRowProps.values } as Record<string, unknown>;
      delete existingValues['__parentRowId'];
      const mergedValues = { ...existingValues, ...autoUpdates, ...parsed.data.values } as Record<
        string,
        PropertyValue
      >;
      const updatedRow = await db
        .update(blocks)
        .set({ properties: { values: mergedValues } as Record<string, unknown> })
        .where(eq(blocks.id, rowId))
        .returning()
        .then((r) => r[0]!);
      checkAutomations(
        databaseId,
        rowId,
        Object.fromEntries(
          Object.entries(parsed.data.values).map(([propId, newVal]) => [
            propId,
            { oldValue: existingRowProps.values?.[propId], newValue: newVal },
          ]),
        ),
      ).catch(() => {});
      return NextResponse.json({ ...updatedRow, parentRowId: null });
    } else {
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
      parentRowUpdate['__parentRowId'] = parsed.data.parentRowId;
    }
  }

  const mergedValues: Record<string, PropertyValue> = {
    ...existingRowProps.values,
    ...autoUpdates,
    ...parsed.data.values,
    ...parentRowUpdate,
  } as Record<string, PropertyValue>;

  const updatedRow = await db
    .update(blocks)
    .set({
      properties: { values: mergedValues } as Record<string, unknown>,
    })
    .where(eq(blocks.id, rowId))
    .returning()
    .then((r) => r[0]!);

  for (const [propId, val] of Object.entries(parsed.data.values)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.reversePropertyId) {
        const newIds = val.value as string[];
        const oldVal = existingRowProps.values?.[propId];
        const oldIds: string[] = oldVal?.type === 'relation' ? (oldVal.value as string[]) : [];

        const removed = oldIds.filter((id) => !newIds.includes(id));
        const added = newIds.filter((id) => !oldIds.includes(id));

        await Promise.all([
          ...removed.map((relId) =>
            syncReverseRelation(rowId, relId, propDef.relation!.reversePropertyId!, false),
          ),
          ...added.map((relId) =>
            syncReverseRelation(rowId, relId, propDef.relation!.reversePropertyId!, true),
          ),
        ]);
      }
    }
  }

  const storedParentId = (mergedValues as Record<string, unknown>)['__parentRowId'] ?? null;

  checkAutomations(
    databaseId,
    rowId,
    Object.fromEntries(
      Object.entries(parsed.data.values).map(([propId, newVal]) => [
        propId,
        {
          oldValue: existingRowProps.values?.[propId],
          newValue: newVal,
        },
      ]),
    ),
  ).catch(() => {});

  return NextResponse.json({ ...updatedRow, parentRowId: storedParentId });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; rowId: string }> },
) {
  await getDefaultUser();
  const { databaseId, rowId } = await params;

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

  const row = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, rowId), eq(blocks.parentId, databaseId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);
  if (!row) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Row not found' },
      { status: 404 },
    );
  }

  await db
    .update(blocks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocks.id, rowId));

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
        .set({ childrenOrder: currentDb.childrenOrder.filter((id) => id !== rowId) })
        .where(eq(blocks.id, databaseId));
    }
  });

  return NextResponse.json({ object: 'row', id: rowId, archived: true });
}
