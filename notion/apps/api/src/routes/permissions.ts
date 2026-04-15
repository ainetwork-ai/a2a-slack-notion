import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requirePermission } from '../middleware/require-permission.js';
import { getPagePermissionLevel } from '../lib/permissions.js';
import type { AppVariables } from '../types/app.js';

const permissions = new Hono<{ Variables: AppVariables }>();

const SetPermissionSchema = z.object({
  userId: z.string(),
  level: z.enum(['full_access', 'can_edit', 'can_comment', 'can_view']),
});

// GET /api/v1/pages/:pageId/permissions — list all permissions for a page
permissions.get('/', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;

  const perms = await prisma.pagePermission.findMany({
    where: { pageId },
    include: {
      user: { select: { id: true, name: true, image: true, walletAddress: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return c.json(perms);
});

// GET /api/v1/pages/:pageId/permissions/me — get current user's effective permission level
permissions.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json(
      { object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' },
      401,
    );
  }

  const pageId = c.req.param('pageId' as never) as string;
  const level = await getPagePermissionLevel(user.id, pageId);

  if (level === null) {
    return c.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'No access to this page' },
      403,
    );
  }

  return c.json({ pageId, userId: user.id, level });
});

// PUT /api/v1/pages/:pageId/permissions — set permission for a user
permissions.put('/', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;

  const body = await c.req.json();
  const parsed = SetPermissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      400,
    );
  }

  const { userId, level } = parsed.data;

  const perm = await prisma.pagePermission.upsert({
    where: { pageId_userId: { pageId, userId } },
    create: { pageId, userId, level },
    update: { level },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  return c.json(perm);
});

// DELETE /api/v1/pages/:pageId/permissions/:userId — remove a user's permission
permissions.delete('/:userId', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;
  const userId = c.req.param('userId');

  const existing = await prisma.pagePermission.findUnique({
    where: { pageId_userId: { pageId, userId } },
  });

  if (!existing) {
    return c.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Permission not found' },
      404,
    );
  }

  await prisma.pagePermission.delete({
    where: { pageId_userId: { pageId, userId } },
  });

  return c.json({ object: 'page_permission', pageId, userId, deleted: true });
});

export { permissions };
