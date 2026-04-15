import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

const favorites = new Hono<{ Variables: AppVariables }>();

// List favorites for workspace
favorites.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const favs = await prisma.favorite.findMany({
    where: { userId: user.id, workspaceId },
    orderBy: { position: 'asc' },
  });

  // Fetch page details for each favorite
  const pageIds = favs.map((f) => f.pageId);
  const pages = await prisma.block.findMany({
    where: { id: { in: pageIds }, type: 'page', archived: false },
    select: { id: true, properties: true, childrenOrder: true },
  });

  const pageMap = new Map(pages.map((p) => [p.id, p]));

  return c.json(favs.map((f) => {
    const page = pageMap.get(f.pageId);
    const props = (page?.properties ?? {}) as Record<string, unknown>;
    return {
      id: f.id,
      pageId: f.pageId,
      title: props['title'] ?? 'Untitled',
      icon: props['icon'] ?? null,
      hasChildren: (page?.childrenOrder.length ?? 0) > 0,
    };
  }));
});

// Add favorite
favorites.post('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId, workspaceId } = await c.req.json();
  if (!pageId || !workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'pageId and workspaceId required' }, 400);

  const maxPos = await prisma.favorite.findFirst({
    where: { userId: user.id, workspaceId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const fav = await prisma.favorite.upsert({
    where: { userId_pageId: { userId: user.id, pageId } },
    create: { userId: user.id, workspaceId, pageId, position: (maxPos?.position ?? 0) + 1 },
    update: {},
  });

  return c.json(fav, 201);
});

// Remove favorite
favorites.delete('/:pageId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  await prisma.favorite.deleteMany({
    where: { userId: user.id, pageId },
  });

  return c.json({ object: 'favorite', pageId, deleted: true });
});

export { favorites };
