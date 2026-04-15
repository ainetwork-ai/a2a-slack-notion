import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
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

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where: { userId: user.id } }),
  ]);

  return c.json({ items, total, limit, offset });
});

// GET /notifications/unread-count — count of unread notifications
notifications.get('/unread-count', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const count = await prisma.notification.count({
    where: { userId: user.id, read: false },
  });

  return c.json({ count });
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
  c.header('X-Accel-Buffering', 'no'); // Disable Nginx buffering

  return stream(c, async (s) => {
    // Send initial keep-alive
    await s.write(': connected\n\n');

    const cleanup = addSseClient(user.id, (chunk) => {
      s.write(chunk).catch(() => {});
    });

    // Keep stream open with periodic heartbeats
    const heartbeat = setInterval(() => {
      s.write(': heartbeat\n\n').catch(() => {
        clearInterval(heartbeat);
        cleanup();
      });
    }, 30_000);

    // Wait until the client disconnects
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

  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  return c.json({ updated: count });
});

// PATCH /notifications/:id/read — mark a single notification as read
notifications.patch('/:id/read', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const { id } = c.req.param();

  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Notification not found' }, 404);
  }
  if (existing.userId !== user.id) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not your notification' }, 403);
  }

  const notification = await prisma.notification.update({
    where: { id },
    data: { read: true },
  });

  return c.json(notification);
});

export { notifications };
