/**
 * Search indexer hooks — thin wrappers around indexer.ts that swallow errors
 * so callers never break on Meilisearch unavailability.
 *
 * Usage:
 *   import { onMessageCreated, onUserUpdated } from '@/lib/search/hooks';
 *   onMessageCreated(msg);  // fire-and-forget, one liner
 */

import {
  indexMessage,
  indexPage,
  indexBlock,
  indexUser,
  deleteFromIndex,
  type MeiliMessage,
  type MeiliPage,
  type MeiliBlock,
  type MeiliUser,
} from './indexer';
import { INDEX_MESSAGES } from './indexes';

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
// Pages + Blocks (Hocuspocus / canvas)
// ---------------------------------------------------------------------------

export function onPageUpdated(page: MeiliPage, blocks: MeiliBlock[]): void {
  try {
    indexPage(page);
    for (const block of blocks) {
      indexBlock(block);
    }
  } catch (err) {
    console.warn('[search] onPageUpdated failed:', err);
  }
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
