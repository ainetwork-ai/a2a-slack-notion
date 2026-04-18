import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionNotifications } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function PATCH() {
  const user = await getDefaultUser();

  const updated = await db
    .update(notionNotifications)
    .set({ read: true })
    .where(and(eq(notionNotifications.userId, user.id), eq(notionNotifications.read, false)))
    .returning({ id: notionNotifications.id });

  return NextResponse.json({ updated: updated.length });
}
