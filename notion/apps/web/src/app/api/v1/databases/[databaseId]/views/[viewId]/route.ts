import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks, databaseViews } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type { FilterGroup, SortRule, ViewConfig, FilterCondition } from '@notion/shared';

const FilterConditionSchema: z.ZodType<FilterCondition> = z.object({
  propertyId: z.string(),
  operator: z.enum([
    'equals', 'does_not_equal', 'contains', 'does_not_contain',
    'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
    'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal',
    'before', 'after', 'on_or_before', 'on_or_after',
    'is_checked', 'is_not_checked',
  ]),
  value: z.unknown().optional(),
});

const FilterGroupSchema: z.ZodType<FilterGroup> = z.object({
  logic: z.enum(['and', 'or']),
  conditions: z.array(FilterConditionSchema),
});

const SortRuleSchema: z.ZodType<SortRule> = z.object({
  propertyId: z.string(),
  direction: z.enum(['ascending', 'descending']),
});

const ViewConfigSchema: z.ZodType<ViewConfig> = z.object({
  visibleProperties: z.array(z.string()),
  columnWidths: z.record(z.string(), z.number()).optional(),
  boardGroupBy: z.string().optional(),
  calendarDateProperty: z.string().optional(),
  galleryCoverProperty: z.string().optional(),
  galleryCardSize: z.enum(['small', 'medium', 'large']).optional(),
  timelineStartProperty: z.string().optional(),
  timelineEndProperty: z.string().optional(),
  timelineZoom: z.enum(['day', 'week', 'month']).optional(),
});

const UpdateViewSchema = z.object({
  name: z.string().optional(),
  filters: FilterGroupSchema.optional(),
  sorts: z.array(SortRuleSchema).optional(),
  groupBy: z
    .object({ propertyId: z.string(), hidden: z.array(z.string()).optional() })
    .optional()
    .nullable(),
  config: ViewConfigSchema.optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; viewId: string }> },
) {
  await getDefaultUser();
  const { databaseId, viewId } = await params;

  const body = await request.json();
  const parsed = UpdateViewSchema.safeParse(body);
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

  const existingView = await db
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.id, viewId), eq(databaseViews.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existingView) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'View not found' },
      { status: 404 },
    );
  }

  const updates: Partial<typeof databaseViews.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.filters !== undefined) updates.filters = parsed.data.filters;
  if (parsed.data.sorts !== undefined) updates.sorts = parsed.data.sorts;
  if (parsed.data.groupBy !== undefined) updates.groupBy = parsed.data.groupBy;
  if (parsed.data.config !== undefined) updates.config = parsed.data.config;

  const updatedView = await db
    .update(databaseViews)
    .set(updates)
    .where(eq(databaseViews.id, viewId))
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(updatedView);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ databaseId: string; viewId: string }> },
) {
  await getDefaultUser();
  const { databaseId, viewId } = await params;

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

  const existingView = await db
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.id, viewId), eq(databaseViews.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existingView) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'View not found' },
      { status: 404 },
    );
  }

  await db.delete(databaseViews).where(eq(databaseViews.id, viewId));

  return NextResponse.json({ object: 'view', id: viewId, deleted: true });
}
