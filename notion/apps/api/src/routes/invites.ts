import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

export const invites = new Hono<{ Variables: AppVariables }>();

// Get invite info (no auth required — preview before accepting)
invites.get('/:token', async (c) => {
  const token = c.req.param('token');

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true, icon: true } },
    },
  });

  if (!invite) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Invite not found' }, 404);

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return c.json({ object: 'error', status: 410, code: 'invite_expired', message: 'This invite link has expired' }, 410);
  }

  return c.json({
    token: invite.token,
    role: invite.role,
    expiresAt: invite.expiresAt,
    workspace: invite.workspace,
  });
});

// Accept invite (auth required)
invites.post('/:token/accept', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const token = c.req.param('token');

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true, icon: true } },
    },
  });

  if (!invite) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Invite not found' }, 404);

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return c.json({ object: 'error', status: 410, code: 'invite_expired', message: 'This invite link has expired' }, 410);
  }

  // Check if already a member
  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
  });

  if (existing) {
    // Already a member — return workspace info so frontend can redirect
    return c.json({ workspace: invite.workspace, alreadyMember: true });
  }

  await prisma.workspaceMember.create({
    data: {
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: invite.role,
    },
  });

  return c.json({ workspace: invite.workspace, alreadyMember: false }, 201);
});
