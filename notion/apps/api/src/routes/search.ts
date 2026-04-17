import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { blocks } from '../../../../slack/src/lib/db/schema';
import { searchPages } from '../lib/search.js';
import type { AppVariables } from '../types/app.js';

const search = new Hono<{ Variables: AppVariables }>();

search.post('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { query, workspaceId, createdBy, limit, offset } = await c.req.json();
  if (!query || !workspaceId) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'query and workspaceId required' }, 400);
  }

  // Try Meilisearch first
  const meiliResult = await searchPages(query, workspaceId, { createdBy, limit, offset });

  if (meiliResult) {
    return c.json({
      object: 'list',
      results: meiliResult.hits,
      total: meiliResult.total,
      source: meiliResult.source,
    });
  }

  // Postgres JSONB LIKE fallback. Drizzle has no direct `path: ['title'],
  // string_contains: query` equivalent, so we use a raw SQL snippet that
  // matches Prisma's behavior: `properties->>'title' ILIKE '%query%'`.
  const q = String(query);
  const pgResults = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      createdBy: blocks.createdBy,
      createdAt: blocks.createdAt,
      updatedAt: blocks.updatedAt,
    })
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
        sql`${blocks.properties}->>'title' ILIKE ${'%' + q + '%'}`,
      ),
    )
    .limit(Number(limit ?? 20))
    .offset(Number(offset ?? 0));

  return c.json({
    object: 'list',
    results: pgResults.map((p) => ({
      id: p.id,
      ...(p.properties as Record<string, unknown>),
      createdBy: p.createdBy,
    })),
    total: pgResults.length,
    source: 'postgres_fallback',
  });
});

export { search };
