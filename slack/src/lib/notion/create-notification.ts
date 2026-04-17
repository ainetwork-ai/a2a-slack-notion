/**
 * Notion notification helpers — enqueue rows into notion_notifications.
 *
 * The notionNotifications table lives in the DB via migration
 * 0012_notion_notifications_webhooks_apikeys.sql but is not exported from
 * the shared schema.ts (which belongs to a different agent). We define the
 * drizzle table inline here to avoid touching that file.
 *
 * Integration point for hocuspocus / comment hooks:
 *   import { createNotionNotification, notifyMention } from '@/lib/notion/create-notification';
 */

import { db } from '@/lib/db';
import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Inline table definition (mirrors 0012_notion_notifications_webhooks_apikeys.sql)
// ---------------------------------------------------------------------------
export const notionNotifications = pgTable('notion_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull().$type<'mention' | 'comment' | 'page_update'>(),
  title: text('title').notNull(),
  body: text('body'),
  pageId: uuid('page_id'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type NotionNotificationType = 'mention' | 'comment' | 'page_update';

export interface CreateNotionNotificationInput {
  userId: string;
  type: NotionNotificationType;
  title: string;
  body?: string;
  pageId?: string;
}

// ---------------------------------------------------------------------------
// Core insert helper
// ---------------------------------------------------------------------------
export async function createNotionNotification(
  input: CreateNotionNotificationInput,
): Promise<typeof notionNotifications.$inferSelect> {
  const [row] = await db
    .insert(notionNotifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      pageId: input.pageId ?? null,
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Batch helper: notify multiple users of a mention on a page
// ---------------------------------------------------------------------------
export async function notifyMention(
  pageId: string,
  pageTitle: string,
  authorDisplayName: string,
  mentionedUserIds: string[],
): Promise<void> {
  if (mentionedUserIds.length === 0) return;

  const unique = [...new Set(mentionedUserIds)];

  await db.insert(notionNotifications).values(
    unique.map((userId) => ({
      userId,
      type: 'mention' as NotionNotificationType,
      title: `${authorDisplayName} mentioned you in "${pageTitle}"`,
      pageId,
    })),
  );
}

// ---------------------------------------------------------------------------
// Mark helpers (used by API routes)
// ---------------------------------------------------------------------------
export async function markNotionNotificationRead(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .update(notionNotifications)
    .set({ read: true })
    .where(
      and(
        eq(notionNotifications.id, id),
        eq(notionNotifications.userId, userId),
      ),
    )
    .returning({ id: notionNotifications.id });
  return result.length > 0;
}

export async function markAllNotionNotificationsRead(
  userId: string,
): Promise<number> {
  const result = await db
    .update(notionNotifications)
    .set({ read: true })
    .where(
      and(
        eq(notionNotifications.userId, userId),
        eq(notionNotifications.read, false),
      ),
    )
    .returning({ id: notionNotifications.id });
  return result.length;
}
