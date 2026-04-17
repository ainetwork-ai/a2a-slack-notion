import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  pageSnapshots,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import { requirePermission } from '../middleware/require-permission.js';
import type { AppVariables } from '../types/app.js';

const history = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// GET /api/v1/pages/:pageId/history
history.get('/', requirePermission('can_view'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;
  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');
  const limit = Math.min(Number(limitParam ?? 20), 100);

  const baseWhere = eq(pageSnapshots.pageId, pageId);

  let whereClause = baseWhere;
  if (cursorParam) {
    const cursorRow = await db
      .select({ createdAt: pageSnapshots.createdAt })
      .from(pageSnapshots)
      .where(eq(pageSnapshots.id, cursorParam))
      .limit(1)
      .then((r) => r[0]);
    if (cursorRow) {
      whereClause = and(baseWhere, lt(pageSnapshots.createdAt, cursorRow.createdAt))!;
    }
  }

  const snapshots = await db
    .select({
      id: pageSnapshots.id,
      pageId: pageSnapshots.pageId,
      title: pageSnapshots.title,
      createdBy: pageSnapshots.createdBy,
      createdAt: pageSnapshots.createdAt,
    })
    .from(pageSnapshots)
    .where(whereClause)
    .orderBy(desc(pageSnapshots.createdAt))
    .limit(limit + 1);

  const hasMore = snapshots.length > limit;
  const items = hasMore ? snapshots.slice(0, limit) : snapshots;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    object: 'list',
    results: items,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
});

// GET /api/v1/pages/:pageId/history/:snapshotId
history.get('/:snapshotId', requirePermission('can_view'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;
  const snapshotId = c.req.param('snapshotId');

  const snapshot = await db
    .select()
    .from(pageSnapshots)
    .where(and(eq(pageSnapshots.id, snapshotId), eq(pageSnapshots.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (!snapshot) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Snapshot not found' }, 404);
  }

  // Slack schema stores snapshot as base64 text, not bytea. Return it as-is.
  return c.json({
    id: snapshot.id,
    pageId: snapshot.pageId,
    title: snapshot.title,
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
    snapshot: snapshot.snapshot,
  });
});

// POST /api/v1/pages/:pageId/history
history.post('/', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;

  const page = await db
    .select({ properties: blocks.properties, content: blocks.content })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const content = (page.content ?? {}) as Record<string, unknown>;
  const title = (props['title'] as string) ?? 'Untitled';
  const yjsSnapshot = content['yjsSnapshot'];

  const snapshotB64 =
    yjsSnapshot && typeof yjsSnapshot === 'string'
      ? yjsSnapshot
      : Buffer.alloc(0).toString('base64');

  const body = await c.req.json().catch(() => ({}));
  const label = (body as Record<string, unknown>)['label'] as string | undefined;

  const created = await db
    .insert(pageSnapshots)
    .values({
      pageId,
      title: label ? `${title} — ${label}` : title,
      snapshot: snapshotB64,
      createdBy: user.id,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(
    {
      id: created.id,
      pageId: created.pageId,
      title: created.title,
      createdBy: created.createdBy,
      createdAt: created.createdAt,
    },
    201,
  );
});

const RestoreSchema = z.object({
  label: z.string().optional(),
});

// POST /api/v1/pages/:pageId/history/:snapshotId/restore
history.post('/:snapshotId/restore', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;
  const snapshotId = c.req.param('snapshotId');

  const body = await c.req.json().catch(() => ({}));
  const parsed = RestoreSchema.safeParse(body);
  const label = parsed.success ? parsed.data.label : undefined;

  const snapshot = await db
    .select()
    .from(pageSnapshots)
    .where(and(eq(pageSnapshots.id, snapshotId), eq(pageSnapshots.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (!snapshot) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Snapshot not found' }, 404);
  }

  const page = await db
    .select({ properties: blocks.properties, content: blocks.content })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const currentContent = (page.content ?? {}) as Record<string, unknown>;
  const currentTitle = (props['title'] as string) ?? 'Untitled';
  const currentYjs = currentContent['yjsSnapshot'];

  const safetyB64 =
    currentYjs && typeof currentYjs === 'string'
      ? currentYjs
      : Buffer.alloc(0).toString('base64');

  const safetyTitle = label
    ? `Before restore — ${label}`
    : `Before restore — ${new Date().toISOString()}`;

  await db.transaction(async (tx) => {
    await tx.insert(pageSnapshots).values({
      pageId,
      title: safetyTitle,
      snapshot: safetyB64,
      createdBy: user.id,
    });

    await tx
      .update(blocks)
      .set({
        properties: { ...props, title: snapshot.title },
        content: {
          ...currentContent,
          yjsSnapshot: snapshot.snapshot,
        } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(blocks.id, pageId));
  });

  return c.json({
    object: 'page',
    id: pageId,
    restoredFrom: snapshotId,
    restoredTitle: snapshot.title,
    safetySnapshotTitle: safetyTitle,
    currentTitle,
  });
});

export { history };
