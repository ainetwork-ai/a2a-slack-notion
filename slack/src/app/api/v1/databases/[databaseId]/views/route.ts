import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  blocks,
  databaseViews,
  type ViewType as DbViewType,
} from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import type { DatabaseBlockProperties, ViewConfig, ViewType } from '@/lib/notion/shared';
import { buildDefaultViewConfig } from '@/lib/notion/databases-helpers';

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

const CreateViewSchema = z.object({
  name: z.string(),
  type: z.enum(['table', 'board', 'list', 'calendar', 'gallery', 'timeline'] as [ViewType, ...ViewType[]]),
  config: ViewConfigSchema.optional(),
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

  return NextResponse.json({ object: 'list', results: views });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ databaseId: string }> },
) {
  await getDefaultUser();
  const { databaseId } = await params;

  const body = await request.json();
  const parsed = CreateViewSchema.safeParse(body);
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

  const maxView = await db
    .select({ position: databaseViews.position })
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(desc(databaseViews.position))
    .limit(1)
    .then((r) => r[0]);
  const nextPosition = (maxView?.position ?? -1) + 1;

  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;
  const defaultConfig = parsed.data.config ?? buildDefaultViewConfig(schema.properties);

  const view = await db
    .insert(databaseViews)
    .values({
      databaseId,
      name: parsed.data.name,
      type: parsed.data.type as DbViewType,
      filters: { logic: 'and', conditions: [] },
      sorts: [],
      config: defaultConfig,
      position: nextPosition,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(view, { status: 201 });
}
