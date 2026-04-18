import { NextResponse } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionNotifications } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET() {
  const user = await getDefaultUser();

  const row = await db
    .select({ value: count() })
    .from(notionNotifications)
    .where(and(eq(notionNotifications.userId, user.id), eq(notionNotifications.read, false)))
    .then((r) => r[0]);

  return NextResponse.json({ count: row?.value ?? 0 });
}
