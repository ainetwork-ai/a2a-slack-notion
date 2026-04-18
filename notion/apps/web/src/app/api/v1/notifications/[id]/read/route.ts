import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionNotifications } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id } = await params;

  const existing = await db
    .select()
    .from(notionNotifications)
    .where(eq(notionNotifications.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Notification not found' },
      { status: 404 },
    );
  }
  if (existing.userId !== user.id) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Not your notification' },
      { status: 403 },
    );
  }

  const notification = await db
    .update(notionNotifications)
    .set({ read: true })
    .where(eq(notionNotifications.id, id))
    .returning()
    .then((r) => r[0]);

  return NextResponse.json(notification);
}
