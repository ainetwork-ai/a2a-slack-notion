import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blockComments } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  await getDefaultUser();
  const { commentId } = await params;

  const existing = await db
    .select()
    .from(blockComments)
    .where(eq(blockComments.id, commentId))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Comment not found' },
      { status: 404 },
    );
  }

  const comment = await db
    .update(blockComments)
    .set({ resolved: !existing.resolved, updatedAt: new Date() })
    .where(eq(blockComments.id, commentId))
    .returning()
    .then((r) => r[0]);

  return NextResponse.json(comment);
}
