/**
 * POST /api/v1/invites/:token/accept — accept an invite and join the workspace.
 *
 * Ported from the deleted Hono `routes/invites.ts#POST /:token/accept`.
 *
 * The original used a prisma `workspaceInvite` with a `role` column. The
 * shared Slack schema's `inviteTokens` has no role, so accepting always adds
 * the user as a plain `member`.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { inviteTokens, workspaceMembers, workspaces } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getDefaultUser();
  const { token } = await params;

  const [invite] = await db
    .select({
      workspaceId: inviteTokens.workspaceId,
      expiresAt: inviteTokens.expiresAt,
      workspaceName: workspaces.name,
      workspaceIconText: workspaces.iconText,
      workspaceIconUrl: workspaces.iconUrl,
    })
    .from(inviteTokens)
    .innerJoin(workspaces, eq(inviteTokens.workspaceId, workspaces.id))
    .where(eq(inviteTokens.token, token))
    .limit(1);

  if (!invite) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Invite not found' },
      { status: 404 },
    );
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json(
      {
        object: 'error',
        status: 410,
        code: 'invite_expired',
        message: 'This invite link has expired',
      },
      { status: 410 },
    );
  }

  const workspaceShape = {
    id: invite.workspaceId,
    name: invite.workspaceName,
    icon: invite.workspaceIconUrl ?? invite.workspaceIconText,
  };

  const [existing] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, invite.workspaceId),
        eq(workspaceMembers.userId, user.id),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ workspace: workspaceShape, alreadyMember: true });
  }

  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: 'member',
    });

  return NextResponse.json(
    { workspace: workspaceShape, alreadyMember: false },
    { status: 201 },
  );
}
