import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  workspaces as workspacesTable,
  workspaceMembers,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import type { AppVariables } from '../types/app.js';

const workspaces = new Hono<{ Variables: AppVariables }>();

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
});

const CreateInviteSchema = z.object({
  role: z.enum(['member', 'guest']).default('member'),
  expiresAt: z.string().datetime().optional(),
});

// Create workspace
workspaces.post('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);
  }

  // Slack's workspaces table uses `iconText` (not `icon`) and does not have
  // a unique `name` constraint handled here — we accept the first-wins insert.
  const workspace = await db.transaction(async (tx) => {
    const ws = await tx
      .insert(workspacesTable)
      .values({
        name: parsed.data.name,
        ...(parsed.data.icon ? { iconText: parsed.data.icon } : {}),
        createdBy: user.id,
      })
      .returning()
      .then((r) => r[0]!);

    await tx.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId: user.id,
      role: 'admin',
    });

    // Create a seed "Getting Started" page block
    await tx.insert(blocks).values({
      type: 'page',
      pageId: ws.id, // NOT NULL in slack schema — use workspace id as placeholder
      workspaceId: ws.id,
      createdBy: user.id,
      properties: { title: 'Getting Started' },
      content: {},
    });

    return ws;
  });

  return c.json(workspace, 201);
});

// List user's workspaces
workspaces.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const rows = await db
    .select({
      ws: workspacesTable,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspacesTable, eq(workspacesTable.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id));

  return c.json(rows.map((m) => ({ ...m.ws, role: m.role })));
});

// Get workspace members
workspaces.get('/:id/members', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.param('id');

  // Ensure caller is a member
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not a member of this workspace' }, 403);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: { id: true, name: true, image: true, walletAddress: true, isAgent: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return c.json(members.map((m) => ({
    id: m.id,
    role: m.role,
    joinedAt: m.createdAt,
    user: m.user,
  })));
});

// Create invite link
workspaces.post('/:id/invites', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.param('id');

  // Only admins can create invites
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not a member of this workspace' }, 403);
  if (membership.role !== 'admin') return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Only admins can create invites' }, 403);

  const body = await c.req.json();
  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);
  }

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId,
      role: parsed.data.role,
      createdBy: user.id,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
    include: {
      workspace: { select: { id: true, name: true, icon: true } },
    },
  });

  return c.json(invite, 201);
});

// Remove member (admin only)
workspaces.delete('/:id/members/:userId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  // Only admins can remove members
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not a member of this workspace' }, 403);
  if (membership.role !== 'admin') return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Only admins can remove members' }, 403);

  // Cannot remove yourself
  if (targetUserId === user.id) {
    return c.json({ object: 'error', status: 400, code: 'bad_request', message: 'Cannot remove yourself from workspace' }, 400);
  }

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!target) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Member not found' }, 404);

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });

  return c.json({ ok: true });
});

export { workspaces };
