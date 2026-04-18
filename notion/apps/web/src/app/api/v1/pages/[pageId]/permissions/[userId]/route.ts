import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pagePermissions } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ pageId: string; userId: string }> },
) {
  const caller = await getDefaultUser();
  const { pageId, userId } = await params;

  const ok = await checkPagePermission(caller.id, pageId, 'full_access');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const existing = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Permission not found' },
      { status: 404 },
    );
  }

  await db
    .delete(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)));

  return NextResponse.json({ object: 'page_permission', pageId, userId, deleted: true });
}
