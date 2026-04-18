import { createHmac } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { appEvents } from './events';
import { db } from './db';
import {
  users,
  blocks,
  notionNotifications,
  notionWebhooks,
} from '@/lib/db/schema';
import { sseClients } from './sse-clients';
import type { MentionEvent } from './events';

export interface CommentEvent {
  blockId: string;
  authorId: string;
  pageId: string;
}

async function deliverNotification(data: {
  type: 'mention' | 'comment' | 'page_update';
  userId: string;
  title: string;
  body?: string;
  pageId?: string;
}) {
  try {
    const notification = await db
      .insert(notionNotifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        pageId: data.pageId,
      })
      .returning()
      .then((r) => r[0]!);

    const writers = sseClients.get(data.userId);
    if (writers && writers.size > 0) {
      const payload = `data: ${JSON.stringify(notification)}\n\n`;
      for (const write of writers) write(payload);
    }
  } catch (err) {
    console.error('[event-handlers] Failed to insert notification:', err);
  }
}

async function deliverWebhook(event: string, data: Record<string, unknown>) {
  try {
    const active = await db
      .select()
      .from(notionWebhooks)
      .where(
        and(
          eq(notionWebhooks.active, true),
          sql`${notionWebhooks.events} ? ${event}`,
        ),
      );
    if (active.length === 0) return;

    const timestamp = new Date().toISOString();
    const body = JSON.stringify({ event, data, timestamp });

    await Promise.allSettled(
      active.map(async (webhook) => {
        try {
          const signature = createHmac('sha256', webhook.secret)
            .update(body)
            .digest('hex');
          const res = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': `sha256=${signature}`,
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            console.error(
              `[event-handlers] webhook ${webhook.url} → HTTP ${res.status}`,
            );
          }
        } catch (err) {
          console.error(
            `[event-handlers] webhook ${webhook.url} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );
  } catch (err) {
    console.error('[event-handlers] Failed to fan out webhook:', err);
  }
}

let setupDone = false;
export function setupEventHandlers() {
  if (setupDone) return;
  setupDone = true;

  appEvents.on('mention.created', async (event: MentionEvent) => {
    if (event.type !== 'user') return;
    const mentioner = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, event.mentionedBy))
      .limit(1)
      .then((r) => r[0]);
    await deliverNotification({
      type: 'mention',
      userId: event.targetId,
      title: `${mentioner?.displayName ?? 'Someone'} mentioned you`,
      pageId: event.pageId,
    });
  });

  appEvents.on('comment.created', async (event: CommentEvent) => {
    const page = await db
      .select({ createdBy: blocks.createdBy, properties: blocks.properties })
      .from(blocks)
      .where(eq(blocks.id, event.pageId))
      .limit(1)
      .then((r) => r[0]);

    if (!page) return;

    if (page.createdBy && page.createdBy !== event.authorId) {
      const commenter = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, event.authorId))
        .limit(1)
        .then((r) => r[0]);

      const props = (page.properties ?? {}) as Record<string, unknown>;
      const pageTitle = (props['title'] as string) ?? 'a page';

      await deliverNotification({
        type: 'comment',
        userId: page.createdBy,
        title: `${commenter?.displayName ?? 'Someone'} commented on "${pageTitle}"`,
        pageId: event.pageId,
      });
    }

    await deliverWebhook('comment.added', {
      blockId: event.blockId,
      authorId: event.authorId,
      pageId: event.pageId,
    });
  });

  appEvents.on(
    'page.created',
    async (event: { pageId: string; workspaceId: string; createdBy: string }) => {
      await deliverWebhook('page.created', event);
    },
  );

  appEvents.on(
    'page.updated',
    async (event: { pageId: string; workspaceId: string; updatedBy: string }) => {
      await deliverWebhook('page.updated', event);
    },
  );

  appEvents.on(
    'block.changed',
    async (event: { blockId: string; pageId: string; updatedBy: string }) => {
      await deliverWebhook('block.changed', event);
    },
  );

  appEvents.on(
    'database.row_created',
    async (event: { rowId: string; databaseId: string; createdBy: string }) => {
      await deliverWebhook('database.row_created', event);
    },
  );
}

// Auto-setup on module load
setupEventHandlers();
