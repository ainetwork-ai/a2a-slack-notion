/**
 * Share-token validation helper.
 *
 * `shareLinks` and `blocks` are defined in 0010_notion_core.sql but are not
 * yet exported from src/lib/db/schema.ts (Agent F ships that schema export
 * separately). Until that lands we define the drizzle table references inline
 * here — drizzle supports table definitions in any file; the underlying SQL
 * tables are the same.
 *
 * Other files that need these tables should import from here rather than
 * duplicating the definitions.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { workspaces, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// ──────────────────────────────────────────────────────────────────────────────
// blocks table (mirrors 0010_notion_core.sql)
// ──────────────────────────────────────────────────────────────────────────────

export type BlockType =
  | 'page' | 'text' | 'heading_1' | 'heading_2' | 'heading_3'
  | 'bulleted_list' | 'numbered_list' | 'to_do' | 'toggle' | 'callout'
  | 'code' | 'divider' | 'image' | 'quote' | 'table' | 'bookmark'
  | 'file' | 'embed' | 'database';

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').$type<BlockType>().notNull(),
    parentId: uuid('parent_id'),
    pageId: uuid('page_id').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().default({}).notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().default({}).notNull(),
    childrenOrder: jsonb('children_order').$type<string[]>().default([]).notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archived: boolean('archived').default(false).notNull(),
  },
  (t) => [
    index('blocks_page_parent_idx').on(t.pageId, t.parentId),
    index('blocks_workspace_type_idx').on(t.workspaceId, t.type),
    index('blocks_parent_idx').on(t.parentId),
  ]
);

export type BlockRow = typeof blocks.$inferSelect;

// ──────────────────────────────────────────────────────────────────────────────
// shareLinks table (mirrors 0010_notion_core.sql share_links table)
// ──────────────────────────────────────────────────────────────────────────────

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id').notNull(),
    token: text('token').unique().notNull(),
    /** 'can_view' | 'can_comment' | 'can_edit' — maps to PermissionLevel */
    level: text('level').$type<'can_view' | 'can_comment' | 'can_edit'>().default('can_view').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('share_links_page_idx').on(t.pageId)]
);

export type ShareLink = typeof shareLinks.$inferSelect;

// ──────────────────────────────────────────────────────────────────────────────
// Validation result types
// ──────────────────────────────────────────────────────────────────────────────

export interface ValidShareData {
  share: ShareLink;
  page: BlockRow;
  pageTitle: string;
}

export type ShareTokenResult =
  | { valid: true; data: ValidShareData }
  | { valid: false; reason: 'not_found' | 'expired' | 'not_public' };

// ──────────────────────────────────────────────────────────────────────────────
// Validation logic
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validate a share token and return the associated page + share record.
 *
 * Rules:
 * - Token must exist in share_links.
 * - expiresAt must be null or in the future.
 * - isPublic must be true (private links require workspace auth — not
 *   implemented here; anonymous public readers only see isPublic=true pages).
 */
export async function validateShareToken(token: string): Promise<ShareTokenResult> {
  const [share] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (!share) {
    return { valid: false, reason: 'not_found' };
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  // For now only isPublic=true grants anonymous read.
  // isPublic=false requires authenticated workspace member (future work).
  if (!share.isPublic) {
    return { valid: false, reason: 'not_public' };
  }

  const [page] = await db
    .select()
    .from(blocks)
    .where(eq(blocks.id, share.pageId))
    .limit(1);

  if (!page || page.type !== 'page' || page.archived) {
    return { valid: false, reason: 'not_found' };
  }

  const rawTitle = (page.properties as Record<string, unknown>)?.title;
  const pageTitle = typeof rawTitle === 'string' && rawTitle.trim()
    ? rawTitle.trim()
    : 'Untitled';

  return { valid: true, data: { share, page, pageTitle } };
}
