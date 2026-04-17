/**
 * DELETE /api/favorites/:id — remove own favorite.
 */

import { db } from '@/lib/db';
import { favorites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const [row] = await db
    .select()
    .from(favorites)
    .where(and(eq(favorites.id, id), eq(favorites.userId, auth.user.id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.delete(favorites).where(eq(favorites.id, id));
  return NextResponse.json({ success: true });
}
