import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  blocks,
  databaseViews,
} from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type { DatabaseBlockProperties } from '@notion/shared';

const UpdateDatabaseSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  archived: z.boolean().optional(),
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

  const views = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(asc(databaseViews.position));

  return NextResponse.json({ ...dbBlock, views });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

  const body = await request.json();
  const parsed = UpdateDatabaseSchema.safeParse(body);
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
  const updatedProps: DatabaseBlockProperties = { ...props };
  if (parsed.data.title !== undefined) updatedProps.title = parsed.data.title;
  if (parsed.data.icon !== undefined) updatedProps.icon = parsed.data.icon;
  if (parsed.data.coverUrl !== undefined) updatedProps.coverUrl = parsed.data.coverUrl;

  const dbBlock = await db
    .update(blocks)
    .set({
      properties: updatedProps as unknown as Record<string, unknown>,
      archived: parsed.data.archived ?? existing.archived,
      updatedAt: new Date(),
    })
    .where(eq(blocks.id, databaseId))
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json({ ...dbBlock });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Database not found' },
      { status: 404 },
    );
  }

  await db
    .update(blocks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocks.id, databaseId));

  if (existing.parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, existing.parentId!))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: parent.childrenOrder.filter((id) => id !== databaseId) })
          .where(eq(blocks.id, existing.parentId!));
      }
    });
  }

  return NextResponse.json({ object: 'database', id: databaseId, archived: true });
}
