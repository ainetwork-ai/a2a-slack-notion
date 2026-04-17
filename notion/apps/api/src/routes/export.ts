import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { blocks } from '../../../../slack/src/lib/db/schema';
import { requirePermission } from '../middleware/require-permission.js';
import { pageToMarkdown } from '../lib/export-markdown.js';
import { databaseToCsv } from '../lib/export-csv.js';
import type { AppVariables } from '../types/app.js';

const exportRoutes = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// POST /api/v1/pages/:pageId/export?format=markdown|csv
exportRoutes.post('/', requirePermission('can_view'), async (c) => {
  const user = requireUser(c);
  if (!user)
    return c.json(
      { object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' },
      401,
    );

  const pageId = c.req.param('pageId' as never) as string;
  const format = c.req.query('format') ?? 'markdown';

  const page = await db
    .select({ id: blocks.id, type: blocks.type, properties: blocks.properties })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.archived, false)))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const title = ((props['title'] as string) ?? 'untitled')
    .replace(/[^a-z0-9_\-]/gi, '_')
    .toLowerCase();

  if (format === 'markdown') {
    let md: string;
    try {
      md = await pageToMarkdown(pageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      return c.json({ object: 'error', status: 500, code: 'export_error', message: msg }, 500);
    }

    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${title}.md"`);
    return c.body(md);
  }

  if (format === 'csv') {
    if (page.type !== 'database') {
      return c.json(
        {
          object: 'error',
          status: 400,
          code: 'invalid_format',
          message: 'CSV export is only supported for database blocks',
        },
        400,
      );
    }

    let csv: string;
    try {
      csv = await databaseToCsv(pageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      return c.json({ object: 'error', status: 500, code: 'export_error', message: msg }, 500);
    }

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${title}.csv"`);
    return c.body(csv);
  }

  return c.json(
    {
      object: 'error',
      status: 400,
      code: 'invalid_format',
      message: 'Unsupported format. Use ?format=markdown or ?format=csv',
    },
    400,
  );
});

export { exportRoutes };
