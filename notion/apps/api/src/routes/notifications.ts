import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { and, count, desc, eq } from 'drizzle-orm';
import { db, notionNotifications } from '../lib/db.js';
import { addSseClient } from '../lib/sse-clients.js';
import type { AppVariables } from '../types/app.js';

const notifications = new Hono<{ Variables: AppVariables }>();

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /notifications — list user's notifications (newest first, paginated)
notifications.get('/', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const parsed = PaginationSchema.safeParse({
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  const { limit, offset } = parsed.success ? parsed.data : { limit: 20, offset: 0 };

  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(notionNotifications)
      .where(eq(notionNotifications.userId, user.id))
      .orderBy(desc(notionNotifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(notionNotifications)
      .where(eq(notionNotifications.userId, user.id))
      .then((r) => r[0]),
  ]);

  const total = totalRow?.value ?? 0;
  return c.json({ items, total, limit, offset });
});

// GET /notifications/unread-count — count of unread notifications
notifications.get('/unread-count', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const row = await db
    .select({ value: count() })
    .from(notionNotifications)
    .where(and(eq(notionNotifications.userId, user.id), eq(notionNotifications.read, false)))
    .then((r) => r[0]);

  return c.json({ count: row?.value ?? 0 });
});

// GET /notifications/stream — SSE endpoint for real-time notifications
notifications.get('/stream', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return stream(c, async (s) => {
    await s.write(': connected\n\n');

    const cleanup = addSseClient(user.id, (chunk) => {
      s.write(chunk).catch(() => {});
    });

    const heartbeat = setInterval(() => {
      s.write(': heartbeat\n\n').catch(() => {
        clearInterval(heartbeat);
        cleanup();
      });
    }, 30_000);

    await new Promise<void>((resolve) => {
      s.onAbort(() => {
        clearInterval(heartbeat);
        cleanup();
        resolve();
      });
    });
  });
});

// PATCH /notifications/read-all — mark all notifications as read
notifications.patch('/read-all', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const updated = await db
    .update(notionNotifications)
    .set({ read: true })
    .where(and(eq(notionNotifications.userId, user.id), eq(notionNotifications.read, false)))
    .returning({ id: notionNotifications.id });

  return c.json({ updated: updated.length });
});

// PATCH /notifications/:id/read — mark a single notification as read
notifications.patch('/:id/read', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const { id } = c.req.param();

  const existing = await db
    .select()
    .from(notionNotifications)
    .where(eq(notionNotifications.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Notification not found' }, 404);
  }
  if (existing.userId !== user.id) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not your notification' }, 403);
  }

  const notification = await db
    .update(notionNotifications)
    .set({ read: true })
    .where(eq(notionNotifications.id, id))
    .returning()
    .then((r) => r[0]);

  return c.json(notification);
});

export { notifications };
