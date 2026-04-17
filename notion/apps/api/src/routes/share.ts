import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  shareLinks,
  blocks,
  type PermissionLevel,
} from '../../../../slack/src/lib/db/schema';
import { requirePermission } from '../middleware/require-permission.js';
import { checkPagePermission } from '../lib/permissions.js';
import type { AppVariables } from '../types/app.js';

export const pageShareRoutes = new Hono<{ Variables: AppVariables }>();
export const shareTokenRoutes = new Hono<{ Variables: AppVariables }>();

const CreateShareLinkSchema = z.object({
  level: z.enum(['full_access', 'can_edit', 'can_comment', 'can_view']).default('can_view'),
  isPublic: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
});

// Generate a compact URL-safe token (slack schema has no default).
function newToken(): string {
  return randomBytes(18).toString('base64url');
}

// POST /pages/:pageId/share — create a share link for a page
pageShareRoutes.post('/', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateShareLinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);
  }

  const { level, isPublic, expiresAt } = parsed.data;

  const page = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const link = await db
    .insert(shareLinks)
    .values({
      pageId,
      token: newToken(),
      level: level as PermissionLevel,
      isPublic,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(link, 201);
});

// GET /pages/:pageId/share — list share links for a page
pageShareRoutes.get('/', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;

  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.pageId, pageId))
    .orderBy(desc(shareLinks.createdAt));

  return c.json(links);
});

// DELETE /share/:token — revoke a share link
shareTokenRoutes.delete('/:token', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const { token } = c.req.param();

  const link = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1)
    .then((r) => r[0]);

  if (!link) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Share link not found' }, 404);
  }

  const hasPermission = await checkPagePermission(user.id, link.pageId, 'full_access');
  if (!hasPermission) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not authorized to delete this share link' }, 403);
  }

  await db.delete(shareLinks).where(eq(shareLinks.token, token));
  return c.json({ object: 'share_link', token, deleted: true });
});

// GET /share/:token — access a page via share link
shareTokenRoutes.get('/:token', async (c) => {
  const { token } = c.req.param();

  const link = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1)
    .then((r) => r[0]);

  if (!link) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Share link not found' }, 404);
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return c.json({ object: 'error', status: 410, code: 'share_link_expired', message: 'This share link has expired' }, 410);
  }

  if (!link.isPublic) {
    const user = c.get('user');
    if (!user) {
      return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Authentication required for this share link' }, 401);
    }
  }

  const page = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, link.pageId), eq(blocks.archived, false)))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const children = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.parentId, page.id), eq(blocks.archived, false)))
    .orderBy(asc(blocks.createdAt));

  return c.json({
    object: 'shared_page',
    accessLevel: link.level,
    readOnly: link.level === 'can_view',
    page: { ...page, children },
  });
});
