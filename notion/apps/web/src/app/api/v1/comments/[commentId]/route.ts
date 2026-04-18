import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blockComments } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const user = await getDefaultUser();
  const { commentId } = await params;

  const existing = await db
    .select({ authorId: blockComments.authorId })
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
  if (existing.authorId !== user.id) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Not authorized to delete this comment' },
      { status: 403 },
    );
  }

  await db.delete(blockComments).where(eq(blockComments.id, commentId));
  return NextResponse.json({ object: 'comment', id: commentId, deleted: true });
}
