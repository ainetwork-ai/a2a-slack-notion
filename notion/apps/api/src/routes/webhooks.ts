import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db, notionWebhooks } from '../lib/db.js';
import type { AppVariables } from '../types/app.js';

const webhooks = new Hono<{ Variables: AppVariables }>();

const ALLOWED_EVENTS = [
  'page.created',
  'page.updated',
  'block.changed',
  'comment.added',
  'database.row_created',
] as const;

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(ALLOWED_EVENTS)).min(1),
});

// POST / — create webhook
webhooks.post('/', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const body = await c.req.json();
  const parsed = CreateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);
  }

  const secret = randomBytes(32).toString('hex');

  const webhook = await db
    .insert(notionWebhooks)
    .values({
      userId: user.id,
      url: parsed.data.url,
      secret,
      events: parsed.data.events as unknown as string[],
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(
    {
      object: 'webhook',
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      secret: webhook.secret, // returned once on creation
      createdAt: webhook.createdAt,
    },
    201,
  );
});

// GET / — list user's webhooks
webhooks.get('/', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const results = await db
    .select({
      id: notionWebhooks.id,
      url: notionWebhooks.url,
      events: notionWebhooks.events,
      active: notionWebhooks.active,
      createdAt: notionWebhooks.createdAt,
    })
    .from(notionWebhooks)
    .where(eq(notionWebhooks.userId, user.id))
    .orderBy(desc(notionWebhooks.createdAt));

  return c.json({ object: 'list', results });
});

// DELETE /:id
webhooks.delete('/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const id = c.req.param('id');

  const existing = await db
    .select()
    .from(notionWebhooks)
    .where(eq(notionWebhooks.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Webhook not found' }, 404);
  }
  if (existing.userId !== user.id) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Access denied' }, 403);
  }

  await db.delete(notionWebhooks).where(eq(notionWebhooks.id, id));

  return c.json({ object: 'webhook', id, deleted: true });
});

export { webhooks };
