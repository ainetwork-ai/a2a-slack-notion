import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  pagePermissions,
  users,
  type PermissionLevel,
} from '../../../../slack/src/lib/db/schema';
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

  const perms = await db
    .select()
    .from(pagePermissions)
    .where(eq(pagePermissions.pageId, pageId))
    .orderBy(asc(pagePermissions.createdAt));

  const userIds = Array.from(new Set(perms.map((p) => p.userId)));
  const userRows =
    userIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.displayName,
            image: users.avatarUrl,
            walletAddress: users.ainAddress,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return c.json(
    perms.map((p) => ({ ...p, user: userMap.get(p.userId) ?? null })),
  );
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

  const existing = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)))
    .limit(1)
    .then((r) => r[0]);

  const perm = existing
    ? await db
        .update(pagePermissions)
        .set({ level: level as PermissionLevel })
        .where(eq(pagePermissions.id, existing.id))
        .returning()
        .then((r) => r[0]!)
    : await db
        .insert(pagePermissions)
        .values({ pageId, userId, level: level as PermissionLevel })
        .returning()
        .then((r) => r[0]!);

  const u = await db
    .select({ id: users.id, name: users.displayName, image: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((r) => r[0] ?? null);

  return c.json({ ...perm, user: u });
});

// DELETE /api/v1/pages/:pageId/permissions/:userId — remove a user's permission
permissions.delete('/:userId', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;
  const userId = c.req.param('userId');

  const existing = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return c.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Permission not found' },
      404,
    );
  }

  await db
    .delete(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)));

  return c.json({ object: 'page_permission', pageId, userId, deleted: true });
});

export { permissions };
