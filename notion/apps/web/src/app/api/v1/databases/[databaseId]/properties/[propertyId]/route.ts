import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type {
  DatabaseBlockProperties,
  DatabaseSchema,
  PropertyDefinition,
  PropertyType,
  FormulaConfig,
  RelationConfig,
  RollupConfig,
} from '@notion/shared';

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

const PROPERTY_TYPE_ENUM = z.enum([
  'title', 'text', 'number', 'select', 'multi_select', 'date', 'person',
  'files', 'checkbox', 'url', 'email', 'phone', 'status',
  'formula', 'relation', 'rollup',
  'created_time', 'created_by', 'last_edited_time', 'last_edited_by',
] as [PropertyType, ...PropertyType[]]);

const UpdatePropertySchema = z.object({
  name: z.string().optional(),
  type: PROPERTY_TYPE_ENUM.optional(),
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; propertyId: string }> },
) {
  await getDefaultUser();
  const { databaseId, propertyId } = await params;

  const body = await request.json();
  const parsed = UpdatePropertySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Database not found' },
      { status: 404 },
    );
  }

  const props = existing.properties as unknown as DatabaseBlockProperties;
  const propIndex = props.schema.properties.findIndex((p) => p.id === propertyId);
  if (propIndex === -1) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Property not found' },
      { status: 404 },
    );
  }

  const existingProp = props.schema.properties[propIndex]!;

  if (parsed.data.type === 'title' && existingProp.type !== 'title') {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'cannot_convert_to_title', message: 'Cannot convert a property to type title' },
      { status: 400 },
    );
  }

  const updatedProp: PropertyDefinition = {
    ...existingProp,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
    ...(parsed.data.options !== undefined ? { options: parsed.data.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color })) } : {}),
    ...(parsed.data.numberFormat !== undefined ? { numberFormat: parsed.data.numberFormat } : {}),
    ...(parsed.data.statusGroups !== undefined ? { statusGroups: parsed.data.statusGroups } : {}),
    ...(parsed.data.formula !== undefined ? { formula: parsed.data.formula as FormulaConfig } : {}),
    ...(parsed.data.relation !== undefined ? { relation: parsed.data.relation as RelationConfig } : {}),
    ...(parsed.data.rollup !== undefined ? { rollup: parsed.data.rollup as RollupConfig } : {}),
  };

  const updatedProperties = [...props.schema.properties];
  updatedProperties[propIndex] = updatedProp;
  const updatedSchema: DatabaseSchema = { properties: updatedProperties };

  await db
    .update(blocks)
    .set({
      properties: { ...props, schema: updatedSchema } as unknown as Record<string, unknown>,
    })
    .where(eq(blocks.id, databaseId));

  return NextResponse.json({ property: updatedProp, schema: updatedSchema });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; propertyId: string }> },
) {
  await getDefaultUser();
  const { databaseId, propertyId } = await params;

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Database not found' },
      { status: 404 },
    );
  }

  const props = existing.properties as unknown as DatabaseBlockProperties;
  const propToDelete = props.schema.properties.find((p) => p.id === propertyId);
  if (!propToDelete) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Property not found' },
      { status: 404 },
    );
  }

  if (propToDelete.type === 'title') {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'cannot_delete_title', message: 'The title property cannot be deleted' },
      { status: 400 },
    );
  }

  if (
    propToDelete.type === 'relation' &&
    propToDelete.relation?.relatedDatabaseId &&
    propToDelete.relation.reversePropertyId
  ) {
    const { relatedDatabaseId, reversePropertyId } = propToDelete.relation;
    const relatedDb = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.id, relatedDatabaseId), eq(blocks.type, 'database')))
      .limit(1)
      .then((r) => r[0]);
    if (relatedDb && !relatedDb.archived) {
      const relatedProps = relatedDb.properties as unknown as DatabaseBlockProperties;
      const filteredRelatedSchema: DatabaseSchema = {
        properties: relatedProps.schema.properties.filter((p) => p.id !== reversePropertyId),
      };
      await db
        .update(blocks)
        .set({
          properties: { ...relatedProps, schema: filteredRelatedSchema } as unknown as Record<string, unknown>,
        })
        .where(eq(blocks.id, relatedDatabaseId));
    }
  }

  const updatedSchema: DatabaseSchema = {
    properties: props.schema.properties.filter((p) => p.id !== propertyId),
  };

  await db
    .update(blocks)
    .set({
      properties: { ...props, schema: updatedSchema } as unknown as Record<string, unknown>,
    })
    .where(eq(blocks.id, databaseId));

  return NextResponse.json({ object: 'property', id: propertyId, deleted: true });
}
