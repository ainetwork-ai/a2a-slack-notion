import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pageTemplates } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await getDefaultUser();
  const { id } = await params;

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

  return NextResponse.json(template);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id } = await params;

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

  if (template.createdBy !== user.id) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Only the template creator can delete it' },
      { status: 403 },
    );
  }

  await db.delete(pageTemplates).where(eq(pageTemplates.id, id));
  return NextResponse.json({ object: 'page_template', id, deleted: true });
}
