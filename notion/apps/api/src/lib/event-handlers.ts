import { appEvents } from './events.js';
import { notificationQueue, webhookQueue } from './queue.js';
import { prisma } from './prisma.js';
import type { MentionEvent } from './events.js';

export interface CommentEvent {
  blockId: string;
  authorId: string;
  pageId: string;
}

/**
 * Wire application events to BullMQ notification and webhook jobs.
 * Call once at server startup.
 */
export function setupEventHandlers() {
  // mention.created → notification for the mentioned user
  appEvents.on('mention.created', async (event: MentionEvent) => {
    if (event.type !== 'user') return; // Only notify for user mentions

    try {
      // Lookup mentioner's name for a friendly notification title
      const mentioner = await prisma.user.findUnique({
        where: { id: event.mentionedBy },
        select: { name: true },
      });

      await notificationQueue.add('mention', {
        type: 'mention',
        userId: event.targetId,
        title: `${mentioner?.name ?? 'Someone'} mentioned you`,
        body: undefined,
        pageId: event.pageId,
      });
    } catch (err) {
      console.error('[event-handlers] Failed to enqueue mention notification:', err);
    }
  });

  // comment.created → notification for the page owner/creator + webhook
  appEvents.on('comment.created', async (event: CommentEvent) => {
    try {
      // Find the page (block of type page) creator
      const page = await prisma.block.findUnique({
        where: { id: event.pageId },
        select: { createdBy: true, properties: true },
      });
      if (!page) return;

      if (page.createdBy !== event.authorId) {
        // Don't notify self
        const commenter = await prisma.user.findUnique({
          where: { id: event.authorId },
          select: { name: true },
        });

        const props = page.properties as Record<string, unknown>;
        const pageTitle = (props['title'] as string) ?? 'a page';

        await notificationQueue.add('comment', {
          type: 'comment',
          userId: page.createdBy,
          title: `${commenter?.name ?? 'Someone'} commented on "${pageTitle}"`,
          body: undefined,
          pageId: event.pageId,
        });
      }

      // Webhook: comment.added
      await webhookQueue.add(
        'webhook',
        {
          event: 'comment.added',
          data: {
            blockId: event.blockId,
            authorId: event.authorId,
            pageId: event.pageId,
          },
        },
        { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
      );
    } catch (err) {
      console.error('[event-handlers] Failed to enqueue comment notification:', err);
    }
  });

  const WEBHOOK_JOB_OPTS = { attempts: 5, backoff: { type: 'exponential' as const, delay: 1000 } };

  // page.created → webhook
  appEvents.on('page.created', async (event: { pageId: string; workspaceId: string; createdBy: string }) => {
    try {
      await webhookQueue.add('webhook', { event: 'page.created', data: event }, WEBHOOK_JOB_OPTS);
    } catch (err) {
      console.error('[event-handlers] Failed to enqueue page.created webhook:', err);
    }
  });

  // page.updated → webhook
  appEvents.on('page.updated', async (event: { pageId: string; workspaceId: string; updatedBy: string }) => {
    try {
      await webhookQueue.add('webhook', { event: 'page.updated', data: event }, WEBHOOK_JOB_OPTS);
    } catch (err) {
      console.error('[event-handlers] Failed to enqueue page.updated webhook:', err);
    }
  });

  // block.changed → webhook
  appEvents.on('block.changed', async (event: { blockId: string; pageId: string; updatedBy: string }) => {
    try {
      await webhookQueue.add('webhook', { event: 'block.changed', data: event }, WEBHOOK_JOB_OPTS);
    } catch (err) {
      console.error('[event-handlers] Failed to enqueue block.changed webhook:', err);
    }
  });

  // database.row_created → webhook
  appEvents.on('database.row_created', async (event: { rowId: string; databaseId: string; createdBy: string }) => {
    try {
      await webhookQueue.add('webhook', { event: 'database.row_created', data: event }, WEBHOOK_JOB_OPTS);
    } catch (err) {
      console.error('[event-handlers] Failed to enqueue database.row_created webhook:', err);
    }
  });
}
