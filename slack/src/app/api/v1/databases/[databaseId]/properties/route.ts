import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type {
  DatabaseBlockProperties,
  DatabaseSchema,
  PropertyDefinition,
  PropertyType,
  FormulaConfig,
  RelationConfig,
  RollupConfig,
} from '@/lib/notion/shared';

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

const AddPropertySchema = z.object({
  name: z.string(),
  type: PROPERTY_TYPE_ENUM,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

  const body = await request.json();
  const parsed = AddPropertySchema.safeParse(body);
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

  if (parsed.data.type === 'title') {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'cannot_add_title', message: 'A database can only have one title property' },
      { status: 400 },
    );
  }

  const newPropId = randomUUID();

  const newProp: PropertyDefinition = {
    id: newPropId,
    name: parsed.data.name,
    type: parsed.data.type,
    ...(parsed.data.options ? { options: parsed.data.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color })) } : {}),
    ...(parsed.data.numberFormat ? { numberFormat: parsed.data.numberFormat } : {}),
    ...(parsed.data.statusGroups ? { statusGroups: parsed.data.statusGroups } : {}),
    ...(parsed.data.formula ? { formula: parsed.data.formula as FormulaConfig } : {}),
    ...(parsed.data.rollup ? { rollup: parsed.data.rollup as RollupConfig } : {}),
  };

  if (parsed.data.type === 'relation' && parsed.data.relation) {
    const { relatedDatabaseId, reversePropertyId: existingReverseId } = parsed.data.relation;

    const relatedDb = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.id, relatedDatabaseId), eq(blocks.type, 'database')))
      .limit(1)
      .then((r) => r[0]);
    if (!relatedDb || relatedDb.archived) {
      return NextResponse.json(
        { object: 'error', status: 400, code: 'validation_error', message: 'Related database not found' },
        { status: 400 },
      );
    }

    const relatedProps = relatedDb.properties as unknown as DatabaseBlockProperties;
    const reverseId = existingReverseId ?? randomUUID();

    const reverseProp: PropertyDefinition = {
      id: reverseId,
      name: `${props.title} (reverse)`,
      type: 'relation',
      relation: {
        relatedDatabaseId: databaseId,
        reversePropertyId: newPropId,
      },
    };

    const updatedRelatedSchema: DatabaseSchema = {
      properties: [...relatedProps.schema.properties, reverseProp],
    };

    await db
      .update(blocks)
      .set({
        properties: { ...relatedProps, schema: updatedRelatedSchema } as unknown as Record<string, unknown>,
      })
      .where(eq(blocks.id, relatedDatabaseId));

    newProp.relation = {
      relatedDatabaseId,
      reversePropertyId: reverseId,
    };
  } else if (parsed.data.relation) {
    newProp.relation = parsed.data.relation as RelationConfig;
  }

  const updatedSchema: DatabaseSchema = {
    properties: [...props.schema.properties, newProp],
  };

  await db
    .update(blocks)
    .set({
      properties: { ...props, schema: updatedSchema } as unknown as Record<string, unknown>,
    })
    .where(eq(blocks.id, databaseId));

  return NextResponse.json({ property: newProp, schema: updatedSchema }, { status: 201 });
}
