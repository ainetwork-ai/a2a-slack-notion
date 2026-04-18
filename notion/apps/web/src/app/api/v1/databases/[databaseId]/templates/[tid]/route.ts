import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
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

const UpdateTemplateSchema = z.object({
  name: z.string().optional(),
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
    .optional(),
  values: z.record(z.string(), PropertyValueSchema).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; tid: string }> },
) {
  await getDefaultUser();
  const { databaseId, tid } = await params;

  const body = await request.json();
  const parsed = UpdateTemplateSchema.safeParse(body);
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

  const existing = await db
    .select()
    .from(databaseTemplates)
    .where(and(eq(databaseTemplates.id, tid), eq(databaseTemplates.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Template not found' },
      { status: 404 },
    );
  }

  const updates: Partial<typeof databaseTemplates.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content as unknown[];
  if (parsed.data.values !== undefined) updates.values = parsed.data.values as Record<string, unknown>;
  if (parsed.data.isDefault !== undefined) updates.isDefault = parsed.data.isDefault;

  const updated = await db
    .update(databaseTemplates)
    .set(updates)
    .where(eq(databaseTemplates.id, tid))
    .returning()
    .then((r) => r[0]);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; tid: string }> },
) {
  await getDefaultUser();
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

  const existing = await db
    .select()
    .from(databaseTemplates)
    .where(and(eq(databaseTemplates.id, tid), eq(databaseTemplates.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Template not found' },
      { status: 404 },
    );
  }

  await db.delete(databaseTemplates).where(eq(databaseTemplates.id, tid));

  return NextResponse.json({ object: 'template', id: tid, deleted: true });
}
