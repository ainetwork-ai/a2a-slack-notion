import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

const workspaces = new Hono<{ Variables: AppVariables }>();

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
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

  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      icon: parsed.data.icon,
      members: {
        create: {
          userId: user.id,
          role: 'admin',
        },
      },
    },
  });

  // Create a seed "Getting Started" page block
  await prisma.block.create({
    data: {
      type: 'page',
      pageId: '', // will self-reference
      workspaceId: workspace.id,
      createdBy: user.id,
      properties: { title: 'Getting Started' },
      content: {},
    },
  });

  return c.json(workspace, 201);
});

// List user's workspaces
workspaces.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
  });

  return c.json(memberships.map((m) => ({ ...m.workspace, role: m.role })));
});

export { workspaces };
