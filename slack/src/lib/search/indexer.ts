/**
 * Debounced upsert helpers for Meilisearch indexes.
 *
 * Each indexX() call is debounced 500 ms per document id so that rapid
 * successive edits (e.g. live typing) collapse into a single Meili write.
 * Call flushAllIndexers() on process exit / graceful shutdown to drain
 * any pending timers before the process dies.
 */

import { meili } from "./meili-client";
import {
  INDEX_MESSAGES,
  INDEX_PAGES,
  INDEX_BLOCKS,
  INDEX_USERS,
  INDEXABLE_BLOCK_TYPES,
  type IndexDefinition,
} from "./indexes";

// ---------------------------------------------------------------------------
// Types (mirroring the DB shape; kept lightweight — no drizzle import here)
// ---------------------------------------------------------------------------

export interface MeiliMessage {
  id: string;
  content: string;
  senderName: string | null;
  workspaceId: string | null;
  channelId: string | null;
  conversationId: string | null;
  senderId: string;
  createdAt: number; // unix ms — Meili filters on numbers
}

export interface MeiliPage {
  id: string;
  title: string;
  topic: string | null;
  workspaceId: string;
  archived: boolean;
  createdBy: string;
}

export interface MeiliBlock {
  id: string;
  text: string;
  type: string;
  workspaceId: string;
  pageId: string;
}

export interface MeiliUser {
  id: string;
  displayName: string;
  ainAddress: string;
  isAgent: boolean;
}

// ---------------------------------------------------------------------------
// Debounce infrastructure
// ---------------------------------------------------------------------------

type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  doc: Record<string, unknown>;
};

// One map per index uid
const pending = new Map<string, Map<string, PendingEntry>>();

function getPendingMap(uid: string): Map<string, PendingEntry> {
  if (!pending.has(uid)) pending.set(uid, new Map());
  return pending.get(uid)!;
}

async function ensureIndex(def: IndexDefinition): Promise<void> {
  try {
    await meili.getIndex(def.uid);
  } catch {
    // Index doesn't exist — create it with correct settings
    await meili.createIndex(def.uid, { primaryKey: def.primaryKey });
    const idx = meili.index(def.uid);
    await idx.updateSettings({
      searchableAttributes: def.searchableAttributes,
      filterableAttributes: def.filterableAttributes,
    });
  }
}

function scheduleUpsert(
  def: IndexDefinition,
  id: string,
  doc: Record<string, unknown>,
  debounceMs = 500
): void {
  const map = getPendingMap(def.uid);
  const existing = map.get(id);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    map.delete(id);
    try {
      await ensureIndex(def);
      await meili.index(def.uid).addDocuments([doc]);
    } catch (err) {
      console.error(`[meili] Failed to upsert ${def.uid}/${id}:`, err);
    }
  }, debounceMs);

  map.set(id, { timer, doc });
}

// ---------------------------------------------------------------------------
// Public upsert helpers
// ---------------------------------------------------------------------------

export function indexMessage(msg: MeiliMessage): void {
  scheduleUpsert(INDEX_MESSAGES, msg.id, msg as unknown as Record<string, unknown>);
}

export function indexPage(page: MeiliPage): void {
  scheduleUpsert(INDEX_PAGES, page.id, page as unknown as Record<string, unknown>);
}

export function indexBlock(block: MeiliBlock): void {
  if (!INDEXABLE_BLOCK_TYPES.has(block.type)) return;
  if (!block.text?.trim()) return;
  scheduleUpsert(INDEX_BLOCKS, block.id, block as unknown as Record<string, unknown>);
}

export function indexUser(user: MeiliUser): void {
  scheduleUpsert(INDEX_USERS, user.id, user as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Delete helper
// ---------------------------------------------------------------------------

export async function deleteFromIndex(indexUid: string, id: string): Promise<void> {
  // Cancel any pending debounced upsert for this id
  const map = pending.get(indexUid);
  if (map?.has(id)) {
    clearTimeout(map.get(id)!.timer);
    map.delete(id);
  }
  try {
    await meili.index(indexUid).deleteDocument(id);
  } catch (err) {
    console.error(`[meili] Failed to delete ${indexUid}/${id}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Flush on shutdown — call from process exit / Next.js lifecycle hooks
// ---------------------------------------------------------------------------

export async function flushAllIndexers(): Promise<void> {
  const flushPromises: Promise<void>[] = [];

  for (const [uid, map] of pending) {
    for (const [id, entry] of map) {
      clearTimeout(entry.timer);
      map.delete(id);
      flushPromises.push(
        (async () => {
          try {
            const def = [INDEX_MESSAGES, INDEX_PAGES, INDEX_BLOCKS, INDEX_USERS].find(
              (d) => d.uid === uid
            );
            if (def) await ensureIndex(def);
            await meili.index(uid).addDocuments([entry.doc]);
          } catch (err) {
            console.error(`[meili] Flush failed for ${uid}/${id}:`, err);
          }
        })()
      );
    }
  }

  await Promise.allSettled(flushPromises);
}
