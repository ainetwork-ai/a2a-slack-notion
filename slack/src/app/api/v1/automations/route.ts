import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
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

const CreateAutomationSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  trigger: TriggerSchema,
  actions: z.array(ActionSchema).min(1),
});

export async function GET(request: NextRequest) {
  await getDefaultUser();

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' },
      { status: 400 },
    );
  }

  const all = await db
    .select()
    .from(automationsTable)
    .where(eq(automationsTable.workspaceId, workspaceId))
    .orderBy(asc(automationsTable.createdAt));

  return NextResponse.json(all);
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const automation = await db
    .insert(automationsTable)
    .values({
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      actions: parsed.data.actions,
      createdBy: user.id,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(automation, { status: 201 });
}
