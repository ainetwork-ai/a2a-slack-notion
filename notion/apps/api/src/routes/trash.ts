import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { blocks } from '../../../../slack/src/lib/db/schema';
import type { AppVariables } from '../types/app.js';

const trash = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// GET /api/v1/trash?workspace_id=...
trash.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);
  }

  const archivedPages = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      parentId: blocks.parentId,
      updatedAt: blocks.updatedAt,
    })
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, true),
      ),
    )
    .orderBy(desc(blocks.updatedAt));

  return c.json(
    archivedPages.map((p) => {
      const props = (p.properties ?? {}) as Record<string, unknown>;
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

// POST /api/v1/trash/:pageId/restore
trash.post('/:pageId/restore', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await db
    .select({ id: blocks.id, parentId: blocks.parentId, archived: blocks.archived })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  if (!page.archived) {
    return c.json({ object: 'error', status: 400, code: 'already_active', message: 'Page is not archived' }, 400);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(blocks)
      .set({ archived: false, updatedAt: new Date() })
      .where(eq(blocks.id, pageId));

    if (page.parentId) {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, page.parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent && !parent.childrenOrder.includes(pageId)) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, pageId] })
          .where(eq(blocks.id, page.parentId));
      }
    }
  });

  return c.json({ object: 'page', id: pageId, archived: false });
});

// DELETE /api/v1/trash/:pageId — permanent hard delete (relies on DB cascade)
trash.delete('/:pageId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await db
    .select({ id: blocks.id, archived: blocks.archived, parentId: blocks.parentId })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

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

  // Note: slack schema does not declare an onDelete cascade for the
  // `blocks.parentId` self-relation, so we do not get automatic child removal.
  // For parity with the Prisma schema we delete the children explicitly here.
  await db.transaction(async (tx) => {
    // Collect all descendants
    const toVisit: string[] = [pageId];
    const allDescendants: string[] = [pageId];
    while (toVisit.length > 0) {
      const parent = toVisit.shift()!;
      const children = await tx
        .select({ id: blocks.id })
        .from(blocks)
        .where(eq(blocks.parentId, parent));
      for (const ch of children) {
        allDescendants.push(ch.id);
        toVisit.push(ch.id);
      }
    }
    // Delete deepest-first. Simpler: delete all in one statement by id list.
    for (const id of allDescendants.reverse()) {
      await tx.delete(blocks).where(eq(blocks.id, id));
    }
  });

  return c.json({ object: 'page', id: pageId, deleted: true }, 200);
});

export { trash };
