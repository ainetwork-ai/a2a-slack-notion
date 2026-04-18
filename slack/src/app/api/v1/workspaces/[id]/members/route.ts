import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  workspaceMembers,
  users,
} from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id: workspaceId } = await params;

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

  const members = await db
    .select({
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
      userId: workspaceMembers.userId,
      userName: users.displayName,
      userImage: users.avatarUrl,
      walletAddress: users.ainAddress,
      isAgent: users.isAgent,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.joinedAt));

  return NextResponse.json(
    members.map((m) => ({
      id: `${workspaceId}:${m.userId}`,
      role: m.role,
      joinedAt: m.joinedAt,
      user: {
        id: m.userId,
        name: m.userName,
        image: m.userImage,
        walletAddress: m.walletAddress,
        isAgent: m.isAgent,
      },
    })),
  );
}
