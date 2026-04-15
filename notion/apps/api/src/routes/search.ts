import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
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

  // Decision #10: PG LIKE fallback when Meilisearch is unavailable
  const pgResults = await prisma.block.findMany({
    where: {
      workspaceId,
      type: 'page',
      archived: false,
      properties: {
        path: ['title'],
        string_contains: query,
      },
    },
    select: {
      id: true,
      properties: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
    take: limit ?? 20,
    skip: offset ?? 0,
  });

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
