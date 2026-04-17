/**
 * GET  /api/notifications/notion?limit=&cursor=&unread=true|false
 *   List the current user's Notion notifications.
 *
 * PATCH /api/notifications/notion  body: { read: true }
 *   Mark all as read (alias for the read-all action; use /read-all subroute for POST).
 */

import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { notionNotifications, markAllNotionNotificationsRead } from '@/lib/notion/create-notification';
import { eq, and, lt, desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const cursor = searchParams.get('cursor'); // ISO timestamp cursor for pagination
  const unreadParam = searchParams.get('unread');

  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

  const conditions = [eq(notionNotifications.userId, user.id)];

  if (unreadParam === 'true') {
    conditions.push(eq(notionNotifications.read, false));
  } else if (unreadParam === 'false') {
    conditions.push(eq(notionNotifications.read, true));
  }

  if (cursor) {
    conditions.push(lt(notionNotifications.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select()
    .from(notionNotifications)
    .where(and(...conditions))
    .orderBy(desc(notionNotifications.createdAt))
    .limit(limit + 1); // fetch one extra to determine hasMore

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

  return NextResponse.json({ items, nextCursor, hasMore });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const body = await req.json() as { read?: boolean };
  if (body.read !== true) {
    return NextResponse.json(
      { error: 'body must contain { "read": true }' },
      { status: 400 },
    );
  }

  const count = await markAllNotionNotificationsRead(user.id);
  return NextResponse.json({ success: true, marked: count });
}
