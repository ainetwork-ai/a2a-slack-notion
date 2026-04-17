import { Hono } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  recentPages,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import type { AppVariables } from '../types/app.js';

const recent = new Hono<{ Variables: AppVariables }>();

// List recent pages for workspace (last 20)
recent.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const recents = await db
    .select()
    .from(recentPages)
    .where(and(eq(recentPages.userId, user.id), eq(recentPages.workspaceId, workspaceId)))
    .orderBy(desc(recentPages.visitedAt))
    .limit(20);

  const pageIds = recents.map((r) => r.pageId);
  const pages =
    pageIds.length > 0
      ? await db
          .select({ id: blocks.id, properties: blocks.properties })
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
    recents
      .filter((r) => pageMap.has(r.pageId))
      .map((r) => {
        const page = pageMap.get(r.pageId)!;
        const props = (page.properties ?? {}) as Record<string, unknown>;
        return {
          pageId: r.pageId,
          title: props['title'] ?? 'Untitled',
          icon: props['icon'] ?? null,
          visitedAt: r.visitedAt,
        };
      }),
  );
});

export { recent };
