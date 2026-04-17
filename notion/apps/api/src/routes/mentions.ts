import { Hono } from 'hono';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  workspaceMembers,
  users,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import { appEvents } from '../lib/events.js';
import type { AppVariables } from '../types/app.js';
import type { MentionEvent } from '../lib/events.js';

const mentions = new Hono<{ Variables: AppVariables }>();

// GET /mentions/suggest?type=user|page&q=searchterm&workspace_id=xxx
mentions.get('/suggest', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const type = c.req.query('type') ?? 'user';
  const q = c.req.query('q') ?? '';
  const workspaceId = c.req.query('workspace_id');

  if (!workspaceId) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);
  }

  if (type === 'user') {
    const results = await db
      .select({
        id: users.id,
        name: users.displayName,
        avatar: users.avatarUrl,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          ilike(users.displayName, `%${q}%`),
        ),
      )
      .limit(5);

    return c.json(
      results.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar ?? undefined })),
    );
  }

  if (type === 'page') {
    const pages = await db
      .select({ id: blocks.id, properties: blocks.properties })
      .from(blocks)
      .where(
        and(
          eq(blocks.workspaceId, workspaceId),
          eq(blocks.type, 'page'),
          eq(blocks.archived, false),
          sql`${blocks.properties}->>'title' ILIKE ${'%' + q + '%'}`,
        ),
      )
      .limit(5);

    const results = pages.map((p) => {
      const props = (p.properties ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        name: (props['title'] as string) ?? 'Untitled',
        icon: (props['icon'] as string | undefined) ?? undefined,
      };
    });

    return c.json(results);
  }

  return c.json([]);
});

// POST /mentions/notify — emit mention.created event
mentions.post('/notify', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const body = await c.req.json() as {
    type: 'user' | 'page' | 'date';
    targetId: string;
    pageId: string;
    blockId: string;
  };

  const { type, targetId, pageId, blockId } = body;
  if (!type || !targetId || !pageId || !blockId) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'type, targetId, pageId, blockId required' },
      400,
    );
  }

  const event: MentionEvent = {
    type,
    targetId,
    pageId,
    blockId,
    mentionedBy: user.id,
  };

  appEvents.emit('mention.created', event);

  return c.json({ ok: true });
});

export { mentions };
