import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

const recent = new Hono<{ Variables: AppVariables }>();

// List recent pages for workspace (last 20)
recent.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const recents = await prisma.recentPage.findMany({
    where: { userId: user.id, workspaceId },
    orderBy: { visitedAt: 'desc' },
    take: 20,
  });

  const pageIds = recents.map((r) => r.pageId);
  const pages = await prisma.block.findMany({
    where: { id: { in: pageIds }, type: 'page', archived: false },
    select: { id: true, properties: true },
  });

  const pageMap = new Map(pages.map((p) => [p.id, p]));

  return c.json(recents
    .filter((r) => pageMap.has(r.pageId))
    .map((r) => {
      const page = pageMap.get(r.pageId)!;
      const props = page.properties as Record<string, unknown>;
      return {
        pageId: r.pageId,
        title: props['title'] ?? 'Untitled',
        icon: props['icon'] ?? null,
        visitedAt: r.visitedAt,
      };
    }));
});

export { recent };
