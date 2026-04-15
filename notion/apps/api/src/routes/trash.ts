import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

const trash = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// GET /api/v1/trash?workspace_id=... — list all archived pages in workspace
trash.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);
  }

  const archivedPages = await prisma.block.findMany({
    where: {
      workspaceId,
      type: 'page',
      archived: true,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      properties: true,
      parentId: true,
      updatedAt: true,
    },
  });

  return c.json(
    archivedPages.map((p) => {
      const props = p.properties as Record<string, unknown>;
      return {
        id: p.id,
        title: (props['title'] as string) ?? 'Untitled',
        icon: (props['icon'] as string | null) ?? null,
        parentId: p.parentId,
        archivedAt: p.updatedAt,
      };
    }),
  );
});

// POST /api/v1/trash/:pageId/restore — un-archive page + re-add to parent childrenOrder
trash.post('/:pageId/restore', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await prisma.block.findUnique({
    where: { id: pageId, type: 'page' },
    select: { id: true, parentId: true, archived: true },
  });

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  if (!page.archived) {
    return c.json({ object: 'error', status: 400, code: 'already_active', message: 'Page is not archived' }, 400);
  }

  await prisma.$transaction(async (tx) => {
    // Un-archive the page
    await tx.block.update({
      where: { id: pageId },
      data: { archived: false },
    });

    // Re-add to parent's childrenOrder if it has a parent
    if (page.parentId) {
      const parent = await tx.block.findUnique({
        where: { id: page.parentId },
        select: { childrenOrder: true },
      });
      if (parent && !parent.childrenOrder.includes(pageId)) {
        await tx.block.update({
          where: { id: page.parentId },
          data: { childrenOrder: [...parent.childrenOrder, pageId] },
        });
      }
    }
  });

  return c.json({ object: 'page', id: pageId, archived: false });
});

// DELETE /api/v1/trash/:pageId — permanent hard delete of page and all descendants
trash.delete('/:pageId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await prisma.block.findUnique({
    where: { id: pageId, type: 'page' },
    select: { id: true, archived: true, parentId: true },
  });

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  if (!page.archived) {
    return c.json(
      {
        object: 'error',
        status: 400,
        code: 'not_in_trash',
        message: 'Page must be in trash before permanent deletion. Archive it first.',
      },
      400,
    );
  }

  // Hard delete — Prisma cascade (Block → BlockTree self-relation onDelete:Cascade) handles children
  await prisma.block.delete({ where: { id: pageId } });

  return c.json({ object: 'page', id: pageId, deleted: true }, 200);
});

export { trash };
