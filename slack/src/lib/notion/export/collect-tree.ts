/**
 * collectPageTree — fetch a Notion page block tree from the database.
 *
 * Defines `blocks` inline (same pattern as create-notification.ts) because
 * the blocks table has not yet been added to the shared schema.ts export.
 * Shape mirrors drizzle/0010_notion_core.sql exactly.
 */

import { db } from '@/lib/db';
import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { eq, and } from 'drizzle-orm';
import type { Block } from './blocks-to-markdown';

// ── Inline table definition (mirrors 0010_notion_core.sql) ───────────────────

const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  parentId: uuid('parent_id'),
  pageId: uuid('page_id').notNull(),
  workspaceId: uuid('workspace_id').notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>().default({}).notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().default({}).notNull(),
  childrenOrder: jsonb('children_order').$type<string[]>().default([]).notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archived: boolean('archived').default(false).notNull(),
});

type BlockRow = typeof blocks.$inferSelect;

/** Convert a drizzle BlockRow to the pure Block interface used by the converter. */
function toBlock(row: BlockRow): Block {
  return {
    id: row.id,
    type: row.type,
    parentId: row.parentId ?? null,
    pageId: row.pageId,
    properties: (row.properties as Record<string, unknown>) ?? {},
    content: (row.content as Record<string, unknown>) ?? {},
    childrenOrder: (row.childrenOrder as string[]) ?? [],
    archived: row.archived,
  };
}

// ── Return type ───────────────────────────────────────────────────────────────

export interface PageTree {
  /** The root page block (type='page'). */
  page: Block;
  /** All descendant blocks belonging to this pageId (excludes the root page itself). */
  blocks: Block[];
  /** parent-id → ordered-children-ids map, derived from childrenOrder fields. */
  tree: Map<string, string[]>;
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a page and all its descendant blocks in one DB round-trip.
 *
 * Strategy:
 *   1. WHERE pageId = ? — returns the root page block + every child block
 *      sharing the same pageId (Notion's flat storage model).
 *   2. Build a parent→children map from childrenOrder fields.
 *
 * @param pageId  UUID of the root page block.
 * @returns       { page, blocks, tree } or throws if the page is not found.
 */
export async function collectPageTree(pageId: string): Promise<PageTree> {
  const rows = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.pageId, pageId), eq(blocks.archived, false)));

  if (rows.length === 0) {
    throw new Error(`Page not found: ${pageId}`);
  }

  // Split root page from child blocks
  const rootRow = rows.find((r) => r.id === pageId && r.type === 'page');
  if (!rootRow) {
    throw new Error(`Root page block not found for pageId: ${pageId}`);
  }

  const childRows = rows.filter((r) => r.id !== pageId);

  const page = toBlock(rootRow);
  const blockList = childRows.map(toBlock);

  // Build parent→ordered-children map from childrenOrder fields
  const tree = new Map<string, string[]>();

  for (const row of rows) {
    const order = Array.isArray(row.childrenOrder) ? (row.childrenOrder as string[]) : [];
    if (order.length > 0) {
      tree.set(row.id, order);
    }
  }

  return { page, blocks: blockList, tree };
}
