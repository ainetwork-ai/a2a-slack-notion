/**
 * PATCH /api/notifications/notion/:id  body: { read: true }
 *   Mark a single Notion notification as read.
 */

import { requireAuth } from '@/lib/auth/middleware';
import { markNotionNotificationRead } from '@/lib/notion/create-notification';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const body = await req.json() as { read?: boolean };
  if (body.read !== true) {
    return NextResponse.json(
      { error: 'body must contain { "read": true }' },
      { status: 400 },
    );
  }

  const updated = await markNotionNotificationRead(id, user.id);
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
