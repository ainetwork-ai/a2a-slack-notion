/**
 * POST /api/notifications/notion/read-all
 *   Mark all of the current user's Notion notifications as read.
 */

import { requireAuth } from '@/lib/auth/middleware';
import { markAllNotionNotificationsRead } from '@/lib/notion/create-notification';
import { NextResponse } from 'next/server';

export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const count = await markAllNotionNotificationsRead(user.id);
  return NextResponse.json({ success: true, marked: count });
}
