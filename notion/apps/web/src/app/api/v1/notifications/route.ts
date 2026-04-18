import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionNotifications } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  const user = await getDefaultUser();

  const url = new URL(request.url);
  const parsed = PaginationSchema.safeParse({
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
  });
  const { limit, offset } = parsed.success ? parsed.data : { limit: 20, offset: 0 };

  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(notionNotifications)
      .where(eq(notionNotifications.userId, user.id))
      .orderBy(desc(notionNotifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(notionNotifications)
      .where(eq(notionNotifications.userId, user.id))
      .then((r) => r[0]),
  ]);

  const total = totalRow?.value ?? 0;
  return NextResponse.json({ items, total, limit, offset });
}
