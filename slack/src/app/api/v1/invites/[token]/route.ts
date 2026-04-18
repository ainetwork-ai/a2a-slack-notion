/**
 * GET /api/v1/invites/:token — preview an invite before accepting.
 *
 * Ported from the deleted Hono `routes/invites.ts#GET /:token`.
 *
 * The original read a prisma `workspaceInvite` with a `role` column. The
 * shared Slack schema only has `inviteTokens` (no role), so the response omits
 * the `role` field the Hono source returned. Workspaces expose `iconText` and
 * `iconUrl`; the response collapses them into a single `icon` field matching
 * the original shape.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { inviteTokens, workspaces } from '@/lib/db/schema';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [invite] = await db
    .select({
      token: inviteTokens.token,
      expiresAt: inviteTokens.expiresAt,
      workspaceId: inviteTokens.workspaceId,
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

  return NextResponse.json({
    token: invite.token,
    expiresAt: invite.expiresAt,
    workspace: {
      id: invite.workspaceId,
      name: invite.workspaceName,
      icon: invite.workspaceIconUrl ?? invite.workspaceIconText,
    },
  });
}
