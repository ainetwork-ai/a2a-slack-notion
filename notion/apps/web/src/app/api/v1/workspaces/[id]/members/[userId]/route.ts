import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { workspaceMembers } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await getDefaultUser();
  const { id: workspaceId, userId: targetUserId } = await params;

  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!membership) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Not a member of this workspace' },
      { status: 403 },
    );
  }
  if (membership.role !== 'admin') {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Only admins can remove members' },
      { status: 403 },
    );
  }

  if (targetUserId === user.id) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'bad_request', message: 'Cannot remove yourself from workspace' },
      { status: 400 },
    );
  }

  const target = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, targetUserId),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!target) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Member not found' },
      { status: 404 },
    );
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, targetUserId),
      ),
    );

  return NextResponse.json({ ok: true });
}
