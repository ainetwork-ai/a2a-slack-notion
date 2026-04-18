import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks, databaseTemplates } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type { PropertyValue } from '@notion/shared';

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

const CreateTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  content: z
    .array(
      z.object({
        type: z.string(),
        properties: z.record(z.string(), z.unknown()),
        content: z.record(z.string(), z.unknown()),
        children: z.array(z.unknown()).optional(),
      }),
    )
    .optional()
    .default([]),
  values: z.record(z.string(), PropertyValueSchema).optional().default({}),
  isDefault: z.boolean().optional().default(false),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

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

  const templates = await db
    .select()
    .from(databaseTemplates)
    .where(eq(databaseTemplates.databaseId, databaseId))
    .orderBy(asc(databaseTemplates.position));

  return NextResponse.json({ object: 'list', results: templates });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

  const body = await request.json();
  const parsed = CreateTemplateSchema.safeParse(body);
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

  const maxTemplate = await db
    .select({ position: databaseTemplates.position })
    .from(databaseTemplates)
    .where(eq(databaseTemplates.databaseId, databaseId))
    .orderBy(desc(databaseTemplates.position))
    .limit(1)
    .then((r) => r[0]);
  const nextPosition = (maxTemplate?.position ?? -1) + 1;

  const template = await db
    .insert(databaseTemplates)
    .values({
      databaseId,
      name: parsed.data.name,
      description: parsed.data.description,
      icon: parsed.data.icon,
      content: parsed.data.content as unknown[],
      values: parsed.data.values as Record<string, unknown>,
      isDefault: parsed.data.isDefault,
      position: nextPosition,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(template, { status: 201 });
}
