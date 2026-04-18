import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pageTemplates } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const CreateTemplateSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().default('custom'),
  content: z.array(z.record(z.string(), z.unknown())).default([]),
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
    .from(pageTemplates)
    .where(eq(pageTemplates.workspaceId, workspaceId))
    .orderBy(asc(pageTemplates.category), asc(pageTemplates.createdAt));

  const grouped: Record<string, typeof all> = {};
  for (const t of all) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category]!.push(t);
  }

  return NextResponse.json({ templates: all, grouped });
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const template = await db
    .insert(pageTemplates)
    .values({
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      category: parsed.data.category,
      content: parsed.data.content as unknown[],
      createdBy: user.id,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(template, { status: 201 });
}
