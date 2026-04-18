/**
 * POST /api/v1/workspaces/:id/invites — create a workspace invite token.
 *
 * Ported from the deleted Hono `routes/workspaces.ts#POST /:id/invites`.
 *
 * The original persisted to a prisma `workspaceInvite` table that had a `role`
 * column. The shared Slack schema only has `inviteTokens` (token, workspaceId,
 * createdBy, expiresAt) and no `role`, so the requested role is echoed back in
 * the JSON response but not stored. `expiresAt` is required in the Slack
 * schema, so it defaults to 7 days from now when the caller omits it.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '@/lib/notion/db';
import { inviteTokens, workspaceMembers, workspaces } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

function generateInviteToken(workspaceId: string): string {
  const timestamp = Date.now().toString(36);
  return createHash('sha256')
    .update(`${workspaceId}:${timestamp}:${process.env.SESSION_SECRET || 'salt'}`)
    .digest('hex')
    .slice(0, 12);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id: workspaceId } = await params;

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Not a member of this workspace' },
      { status: 403 },
    );
  }
  if (membership.role !== 'admin') {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Only admins can create invites' },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    role?: 'member' | 'guest';
    expiresAt?: string;
  };
  const role = body.role === 'guest' ? 'guest' : 'member';

  let expiresAt: Date;
  if (body.expiresAt) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        {
          object: 'error',
          status: 400,
          code: 'validation_error',
          message: 'expiresAt must be an ISO-8601 datetime',
        },
        { status: 400 },
      );
    }
    expiresAt = parsed;
  } else {
    // Slack schema requires expiresAt — default to 7 days when omitted.
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const token = generateInviteToken(workspaceId);

  const [invite] = await db
    .insert(inviteTokens)
    .values({
      token,
      workspaceId,
      createdBy: user.id,
      expiresAt,
    })
    .returning();

  if (!invite) {
    return NextResponse.json(
      { error: 'Failed to create invite' },
      { status: 500 },
    );
  }

  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      iconText: workspaces.iconText,
      iconUrl: workspaces.iconUrl,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return NextResponse.json(
    {
      id: invite.id,
      token: invite.token,
      workspaceId: invite.workspaceId,
      createdBy: invite.createdBy,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      role,
      workspace: workspace
        ? {
            id: workspace.id,
            name: workspace.name,
            icon: workspace.iconUrl ?? workspace.iconText,
          }
        : null,
    },
    { status: 201 },
  );
}
