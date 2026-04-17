/**
 * Search indexer hooks — thin wrappers around indexer.ts that swallow errors
 * so callers never break on Meilisearch unavailability.
 *
 * Usage:
 *   import { onMessageCreated, onPageCreated } from '@/lib/search/hooks';
 *   onMessageCreated(msg);  // fire-and-forget, one liner
 *
 * Every hook here MUST be safe to call without `await` — network failures,
 * missing MEILI_HOST, or unreachable Meili servers must never surface.
 */

import {
  indexMessage,
  indexPage,
  indexBlock,
  indexUser,
  indexChannel,
  deleteFromIndex,
  extractTitle,
  extractBlockText,
  type MeiliMessage,
  type MeiliPage,
  type MeiliBlock,
  type MeiliUser,
  type MeiliChannel,
} from './indexer';
import {
  INDEX_MESSAGES,
  INDEX_PAGES,
  INDEX_BLOCKS,
  INDEX_CHANNELS,
  INDEXABLE_BLOCK_TYPES,
} from './indexes';

// ---------------------------------------------------------------------------
// Shape describing a row from the `blocks` DB table — kept structural so we
// don't have to import drizzle types here.
// ---------------------------------------------------------------------------

export interface BlockRow {
  id: string;
  type: string;
  pageId: string;
  workspaceId: string;
  properties: unknown;
  content: unknown;
  archived?: boolean;
  createdBy?: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

function toUnixMs(d: Date | string | null | undefined): number | undefined {
  if (!d) return undefined;
  if (d instanceof Date) return d.getTime();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function onMessageCreated(msg: MeiliMessage): void {
  try {
    indexMessage(msg);
  } catch (err) {
    console.warn('[search] onMessageCreated failed:', err);
  }
}

export function onMessageUpdated(msg: MeiliMessage): void {
  try {
    indexMessage(msg);
  } catch (err) {
    console.warn('[search] onMessageUpdated failed:', err);
  }
}

export function onMessageDeleted(id: string): void {
  deleteFromIndex(INDEX_MESSAGES.uid, id).catch((err) => {
    console.warn('[search] onMessageDeleted failed:', err);
  });
}

// ---------------------------------------------------------------------------
// Pages (blocks.type='page') — indexed in the `pages` Meili index
// ---------------------------------------------------------------------------

/** Project a `blocks` row of type='page' into a MeiliPage document. */
export function pageRowToDoc(row: BlockRow): MeiliPage {
  const props = (row.properties ?? {}) as Record<string, unknown>;
  const title = extractTitle(props) || 'Untitled';
  const topic = typeof props.topic === 'string' ? props.topic : null;
  const icon = typeof props.icon === 'string' ? props.icon : null;
  return {
    id: row.id,
    title,
    topic,
    icon,
    workspaceId: row.workspaceId,
    archived: !!row.archived,
    createdBy: row.createdBy ?? '',
    createdAt: toUnixMs(row.createdAt),
    updatedAt: toUnixMs(row.updatedAt),
  };
}

/** Project a non-page `blocks` row into a MeiliBlock document (empty text → skip). */
export function blockRowToDoc(row: BlockRow): MeiliBlock | null {
  const text = extractBlockText(row.content, row.properties);
  if (!text) return null;
  return {
    id: row.id,
    text,
    type: row.type,
    workspaceId: row.workspaceId,
    pageId: row.pageId,
    archived: !!row.archived,
  };
}

export function onPageCreated(row: BlockRow): void {
  try {
    indexPage(pageRowToDoc(row));
  } catch (err) {
    console.warn('[search] onPageCreated failed:', err);
  }
}

export function onPageUpdated(row: BlockRow, blockRows: BlockRow[] = []): void {
  try {
    indexPage(pageRowToDoc(row));
    for (const b of blockRows) {
      if (!INDEXABLE_BLOCK_TYPES.has(b.type)) continue;
      const doc = blockRowToDoc(b);
      if (doc) indexBlock(doc);
    }
  } catch (err) {
    console.warn('[search] onPageUpdated failed:', err);
  }
}

export function onPageDeleted(id: string): void {
  deleteFromIndex(INDEX_PAGES.uid, id).catch((err) => {
    console.warn('[search] onPageDeleted failed:', err);
  });
}

// ---------------------------------------------------------------------------
// Blocks (non-page children of a page)
// ---------------------------------------------------------------------------

export function onBlockCreated(row: BlockRow): void {
  try {
    if (row.type === 'page') {
      onPageCreated(row);
      return;
    }
    if (!INDEXABLE_BLOCK_TYPES.has(row.type)) return;
    const doc = blockRowToDoc(row);
    if (doc) indexBlock(doc);
  } catch (err) {
    console.warn('[search] onBlockCreated failed:', err);
  }
}

export function onBlockUpdated(row: BlockRow): void {
  try {
    if (row.type === 'page') {
      // Page title/icon change — reindex the page document itself
      indexPage(pageRowToDoc(row));
      return;
    }
    if (!INDEXABLE_BLOCK_TYPES.has(row.type)) {
      // Became unindexable (type change) — drop any stale doc
      deleteFromIndex(INDEX_BLOCKS.uid, row.id).catch(() => {});
      return;
    }
    const doc = blockRowToDoc(row);
    if (doc) {
      indexBlock(doc);
    } else {
      // Content emptied — remove
      deleteFromIndex(INDEX_BLOCKS.uid, row.id).catch(() => {});
    }
  } catch (err) {
    console.warn('[search] onBlockUpdated failed:', err);
  }
}

export function onBlockDeleted(id: string, isPage = false): void {
  const uid = isPage ? INDEX_PAGES.uid : INDEX_BLOCKS.uid;
  deleteFromIndex(uid, id).catch((err) => {
    console.warn('[search] onBlockDeleted failed:', err);
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function onUserUpdated(user: MeiliUser): void {
  try {
    indexUser(user);
  } catch (err) {
    console.warn('[search] onUserUpdated failed:', err);
  }
}

export function onUserDeleted(userId: string): void {
  deleteFromIndex('users', userId).catch((err) => {
    console.warn('[search] onUserDeleted failed:', err);
  });
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export function onChannelUpserted(channel: MeiliChannel): void {
  try {
    indexChannel(channel);
  } catch (err) {
    console.warn('[search] onChannelUpserted failed:', err);
  }
}

export function onChannelDeleted(id: string): void {
  deleteFromIndex(INDEX_CHANNELS.uid, id).catch((err) => {
    console.warn('[search] onChannelDeleted failed:', err);
  });
}
