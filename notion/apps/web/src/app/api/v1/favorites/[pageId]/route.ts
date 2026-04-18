import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { favorites as favoritesTable } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  await db
    .delete(favoritesTable)
    .where(and(eq(favoritesTable.userId, user.id), eq(favoritesTable.pageId, pageId)));

  return NextResponse.json({ object: 'favorite', pageId, deleted: true });
}
