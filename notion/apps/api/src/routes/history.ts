import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requirePermission } from '../middleware/require-permission.js';
import type { AppVariables } from '../types/app.js';

const history = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// GET /api/v1/pages/:pageId/history — list snapshots newest first, paginated
history.get('/', requirePermission('can_view'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;
  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');
  const limit = Math.min(Number(limitParam ?? 20), 100);

  const snapshots = await prisma.pageSnapshot.findMany({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursorParam ? { cursor: { id: cursorParam }, skip: 1 } : {}),
    select: {
      id: true,
      pageId: true,
      title: true,
      createdBy: true,
      createdAt: true,
      // exclude snapshot bytes from list
    },
  });

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

// GET /api/v1/pages/:pageId/history/:snapshotId — get single snapshot (base64)
history.get('/:snapshotId', requirePermission('can_view'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;
  const snapshotId = c.req.param('snapshotId');

  const snapshot = await prisma.pageSnapshot.findFirst({
    where: { id: snapshotId, pageId },
  });

  if (!snapshot) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Snapshot not found' }, 404);
  }

  return c.json({
    id: snapshot.id,
    pageId: snapshot.pageId,
    title: snapshot.title,
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
    snapshot: Buffer.from(snapshot.snapshot).toString('base64'),
  });
});

// POST /api/v1/pages/:pageId/history — manually save a snapshot ("Save version")
history.post('/', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;

  const page = await prisma.block.findUnique({
    where: { id: pageId, type: 'page' },
    select: { properties: true, content: true },
  });

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const props = page.properties as Record<string, unknown>;
  const content = page.content as Record<string, unknown>;
  const title = (props['title'] as string) ?? 'Untitled';
  const yjsSnapshot = content['yjsSnapshot'];

  // If no Yjs snapshot exists yet, store empty bytes as placeholder
  const snapshotBytes =
    yjsSnapshot && typeof yjsSnapshot === 'string'
      ? Buffer.from(yjsSnapshot, 'base64')
      : Buffer.alloc(0);

  const body = await c.req.json().catch(() => ({}));
  const label = (body as Record<string, unknown>)['label'] as string | undefined;

  const created = await prisma.pageSnapshot.create({
    data: {
      pageId,
      title: label ? `${title} — ${label}` : title,
      snapshot: snapshotBytes,
      createdBy: user.id,
    },
  });

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

// POST /api/v1/pages/:pageId/history/:snapshotId/restore — restore a snapshot
history.post('/:snapshotId/restore', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const pageId = c.req.param('pageId' as never) as string;
  const snapshotId = c.req.param('snapshotId');

  const body = await c.req.json().catch(() => ({}));
  const parsed = RestoreSchema.safeParse(body);
  const label = parsed.success ? parsed.data.label : undefined;

  const snapshot = await prisma.pageSnapshot.findFirst({
    where: { id: snapshotId, pageId },
  });

  if (!snapshot) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Snapshot not found' }, 404);
  }

  const page = await prisma.block.findUnique({
    where: { id: pageId, type: 'page' },
    select: { properties: true, content: true },
  });

  if (!page) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const props = page.properties as Record<string, unknown>;
  const currentContent = page.content as Record<string, unknown>;
  const currentTitle = (props['title'] as string) ?? 'Untitled';
  const currentYjs = currentContent['yjsSnapshot'];

  // Safety net: save a snapshot of current state before restoring
  const safetyBytes =
    currentYjs && typeof currentYjs === 'string'
      ? Buffer.from(currentYjs, 'base64')
      : Buffer.alloc(0);

  const safetyTitle = label
    ? `Before restore — ${label}`
    : `Before restore — ${new Date().toISOString()}`;

  // Atomically: (1) save safety snapshot, (2) apply restored snapshot to Block
  await prisma.$transaction(async (tx) => {
    await tx.pageSnapshot.create({
      data: {
        pageId,
        title: safetyTitle,
        snapshot: safetyBytes,
        createdBy: user.id,
      },
    });

    await tx.block.update({
      where: { id: pageId },
      data: {
        properties: { ...props, title: snapshot.title },
        content: {
          ...currentContent,
          yjsSnapshot: Buffer.from(snapshot.snapshot).toString('base64'),
        } as Record<string, string>,
      },
    });
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
