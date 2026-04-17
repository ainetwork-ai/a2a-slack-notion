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
  INDEX_CHANNELS,
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
  icon?: string | null;
  workspaceId: string;
  archived: boolean;
  createdBy: string;
  // Unix ms — Meili filters on numbers
  createdAt?: number;
  updatedAt?: number;
}

export interface MeiliBlock {
  id: string;
  text: string;
  type: string;
  workspaceId: string;
  pageId: string;
  archived?: boolean;
}

export interface MeiliUser {
  id: string;
  displayName: string;
  ainAddress: string;
  isAgent: boolean;
}

export interface MeiliChannel {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  isArchived: boolean;
  isPrivate: boolean;
}

// ---------------------------------------------------------------------------
// Extractors — best-effort text extraction from polymorphic JSONB columns
// ---------------------------------------------------------------------------

/** Extract a plain-text title from blocks.properties. */
export function extractTitle(properties: unknown): string {
  if (!properties || typeof properties !== "object") return "";
  const p = properties as Record<string, unknown>;
  const raw = p.title;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    // Flatten Notion-style rich text [[text, annotations], ...] or plain string[]
    return raw
      .map((seg) => {
        if (typeof seg === "string") return seg;
        if (Array.isArray(seg)) return String(seg[0] ?? "");
        if (seg && typeof seg === "object" && "text" in seg) {
          return String((seg as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * Extract searchable text from a block's `content` (JSONB) and `properties`.
 * Handles:
 *   - Notion-style { text: "..." } or { text: [[str, attrs], ...] }
 *   - Tiptap-style { content: [{ type: 'text', text: '...' }] } (recursive)
 *   - { caption: "..." }, { alt: "..." } for media blocks
 */
export function extractBlockText(
  content: unknown,
  properties?: unknown,
): string {
  const parts: string[] = [];

  // properties.title is the richest source for most block types
  const t = extractTitle(properties);
  if (t) parts.push(t);

  function walk(node: unknown): void {
    if (!node) return;
    if (typeof node === "string") {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === "string") parts.push(obj.text);
      else if (Array.isArray(obj.text)) walk(obj.text);
      if (typeof obj.caption === "string") parts.push(obj.caption);
      if (typeof obj.alt === "string") parts.push(obj.alt);
      if (typeof obj.url === "string") parts.push(obj.url);
      if (Array.isArray(obj.content)) walk(obj.content);
    }
  }

  walk(content);
  return parts.join(" ").replace(/\s+/g, " ").trim();
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

export function indexChannel(channel: MeiliChannel): void {
  scheduleUpsert(
    INDEX_CHANNELS,
    channel.id,
    channel as unknown as Record<string, unknown>,
  );
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
            const def = [
              INDEX_MESSAGES,
              INDEX_PAGES,
              INDEX_BLOCKS,
              INDEX_USERS,
              INDEX_CHANNELS,
            ].find((d) => d.uid === uid);
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
