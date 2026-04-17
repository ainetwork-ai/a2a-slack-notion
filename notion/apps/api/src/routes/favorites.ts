import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  favorites as favoritesTable,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import type { AppVariables } from '../types/app.js';

const favorites = new Hono<{ Variables: AppVariables }>();

// List favorites for workspace
favorites.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const favs = await db
    .select()
    .from(favoritesTable)
    .where(
      and(eq(favoritesTable.userId, user.id), eq(favoritesTable.workspaceId, workspaceId)),
    )
    .orderBy(asc(favoritesTable.position));

  const pageIds = favs.map((f) => f.pageId);
  const pages =
    pageIds.length > 0
      ? await db
          .select({
            id: blocks.id,
            properties: blocks.properties,
            childrenOrder: blocks.childrenOrder,
          })
          .from(blocks)
          .where(
            and(
              inArray(blocks.id, pageIds),
              eq(blocks.type, 'page'),
              eq(blocks.archived, false),
            ),
          )
      : [];

  const pageMap = new Map(pages.map((p) => [p.id, p]));

  return c.json(
    favs.map((f) => {
      const page = pageMap.get(f.pageId);
      const props = (page?.properties ?? {}) as Record<string, unknown>;
      return {
        id: f.id,
        pageId: f.pageId,
        title: props['title'] ?? 'Untitled',
        icon: props['icon'] ?? null,
        hasChildren: (page?.childrenOrder.length ?? 0) > 0,
      };
    }),
  );
});

// Add favorite
favorites.post('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId, workspaceId } = await c.req.json();
  if (!pageId || !workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'pageId and workspaceId required' }, 400);

  const existing = await db
    .select()
    .from(favoritesTable)
    .where(and(eq(favoritesTable.userId, user.id), eq(favoritesTable.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (existing) {
    return c.json(existing, 201);
  }

  const maxPos = await db
    .select({ position: favoritesTable.position })
    .from(favoritesTable)
    .where(
      and(eq(favoritesTable.userId, user.id), eq(favoritesTable.workspaceId, workspaceId)),
    )
    .orderBy(desc(favoritesTable.position))
    .limit(1)
    .then((r) => r[0]);

  const fav = await db
    .insert(favoritesTable)
    .values({
      userId: user.id,
      workspaceId,
      pageId,
      position: (maxPos?.position ?? 0) + 1,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(fav, 201);
});

// Remove favorite
favorites.delete('/:pageId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  await db
    .delete(favoritesTable)
    .where(and(eq(favoritesTable.userId, user.id), eq(favoritesTable.pageId, pageId)));

  return c.json({ object: 'favorite', pageId, deleted: true });
});

export { favorites };
