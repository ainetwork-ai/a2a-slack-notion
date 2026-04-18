import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { automations as automationsTable } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const TriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status_change'),
    config: z.object({
      databaseId: z.string(),
      fromStatus: z.string().optional(),
      toStatus: z.string(),
    }),
  }),
  z.object({
    type: z.literal('item_created'),
    config: z.object({
      databaseId: z.string(),
    }),
  }),
]);

const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_notification'),
    config: z.object({
      userId: z.string(),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal('update_property'),
    config: z.object({
      propertyId: z.string(),
      value: z.unknown(),
    }),
  }),
]);

const UpdateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  trigger: TriggerSchema.optional(),
  actions: z.array(ActionSchema).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await getDefaultUser();
  const { id } = await params;

  const body = await request.json();
  const parsed = UpdateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(automationsTable)
    .where(eq(automationsTable.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Automation not found' },
      { status: 404 },
    );
  }

  const updateData: Partial<typeof automationsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.trigger !== undefined) updateData.trigger = parsed.data.trigger;
  if (parsed.data.actions !== undefined) updateData.actions = parsed.data.actions;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;

  const updated = await db
    .update(automationsTable)
    .set(updateData)
    .where(eq(automationsTable.id, id))
    .returning()
    .then((r) => r[0]);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await getDefaultUser();
  const { id } = await params;

  const existing = await db
    .select()
    .from(automationsTable)
    .where(eq(automationsTable.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Automation not found' },
      { status: 404 },
    );
  }

  await db.delete(automationsTable).where(eq(automationsTable.id, id));
  return NextResponse.json({ object: 'automation', id, deleted: true });
}
