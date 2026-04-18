import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pageTemplates, blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const ApplyTemplateQuerySchema = z.object({
  workspace_id: z.string(),
  parent_id: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id } = await params;

  const url = new URL(request.url);
  const queryParsed = ApplyTemplateQuerySchema.safeParse({
    workspace_id: url.searchParams.get('workspace_id'),
    parent_id: url.searchParams.get('parent_id') ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: queryParsed.error.message },
      { status: 400 },
    );
  }

  const { workspace_id: workspaceId, parent_id: parentId } = queryParsed.data;

  const template = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!template) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Template not found' },
      { status: 404 },
    );
  }

  const created = await db
    .insert(blocks)
    .values({
      type: 'page',
      parentId: parentId ?? null,
      pageId: workspaceId,
      workspaceId,
      createdBy: user.id,
      properties: {
        title: template.name,
        icon: template.icon ?? null,
        coverUrl: null,
      },
      content: { templateContent: template.content },
    })
    .returning()
    .then((r) => r[0]!);

  const updated = await db
    .update(blocks)
    .set({ pageId: created.id })
    .where(eq(blocks.id, created.id))
    .returning()
    .then((r) => r[0]!);

  if (parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, created.id] })
          .where(eq(blocks.id, parentId));
      }
    });
  }

  return NextResponse.json(
    {
      id: updated.id,
      ...(updated.properties as Record<string, unknown>),
      templateContent: template.content,
    },
    { status: 201 },
  );
}
