import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requirePermission } from '../middleware/require-permission.js';
import { checkPagePermission } from '../lib/permissions.js';
import type { AppVariables } from '../types/app.js';

// Two separate routers — one mounted under /pages/:pageId/share, one under /share
export const pageShareRoutes = new Hono<{ Variables: AppVariables }>();
export const shareTokenRoutes = new Hono<{ Variables: AppVariables }>();

const CreateShareLinkSchema = z.object({
  level: z.enum(['full_access', 'can_edit', 'can_comment', 'can_view']).default('can_view'),
  isPublic: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
});

// POST /pages/:pageId/share — create a share link for a page
pageShareRoutes.post('/', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateShareLinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);
  }

  const { level, isPublic, expiresAt } = parsed.data;

  // Verify page exists
  const page = await prisma.block.findUnique({ where: { id: pageId, type: 'page' } });
  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const link = await prisma.shareLink.create({
    data: {
      pageId,
      level,
      isPublic,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return c.json(link, 201);
});

// GET /pages/:pageId/share — list share links for a page
pageShareRoutes.get('/', requirePermission('full_access'), async (c) => {
  const pageId = c.req.param('pageId' as never) as string;

  const links = await prisma.shareLink.findMany({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(links);
});

// DELETE /share/:token — revoke a share link
shareTokenRoutes.delete('/:token', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const { token } = c.req.param();

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Share link not found' }, 404);
  }

  const hasPermission = await checkPagePermission(user.id, link.pageId, 'full_access');
  if (!hasPermission) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not authorized to delete this share link' }, 403);
  }

  await prisma.shareLink.delete({ where: { token } });
  return c.json({ object: 'share_link', token, deleted: true });
});

// GET /share/:token — access a page via share link (public if isPublic=true, no auth needed)
shareTokenRoutes.get('/:token', async (c) => {
  const { token } = c.req.param();

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Share link not found' }, 404);
  }

  // Check expiry
  if (link.expiresAt && link.expiresAt < new Date()) {
    return c.json({ object: 'error', status: 410, code: 'share_link_expired', message: 'This share link has expired' }, 410);
  }

  // Non-public links require authentication
  if (!link.isPublic) {
    const user = c.get('user');
    if (!user) {
      return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Authentication required for this share link' }, 401);
    }
  }

  // Fetch the page content
  const page = await prisma.block.findUnique({
    where: { id: link.pageId, archived: false },
    include: {
      children: {
        where: { archived: false },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  return c.json({
    object: 'shared_page',
    accessLevel: link.level,
    readOnly: link.level === 'can_view',
    page,
  });
});
