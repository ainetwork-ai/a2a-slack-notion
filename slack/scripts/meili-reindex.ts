#!/usr/bin/env tsx
/**
 * One-off reindex script: rebuilds all Meilisearch indexes from Postgres.
 *
 * Usage:
 *   pnpm tsx scripts/meili-reindex.ts
 *   pnpm tsx scripts/meili-reindex.ts --index=messages
 *   pnpm tsx scripts/meili-reindex.ts --index=pages
 *   pnpm tsx scripts/meili-reindex.ts --index=blocks
 *   pnpm tsx scripts/meili-reindex.ts --index=users
 *   pnpm tsx scripts/meili-reindex.ts --index=all
 *
 * Env vars required (same as app):
 *   POSTGRES_URL        — Postgres connection string
 *   MEILI_HOST          — defaults to http://localhost:7700
 *   MEILI_MASTER_KEY    — Meili master key
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

// @ts-expect-error TODO: add meilisearch to package.json — `pnpm add meilisearch`
import { MeiliSearch } from "meilisearch";

import {
  INDEX_MESSAGES,
  INDEX_PAGES,
  INDEX_BLOCKS,
  INDEX_USERS,
  INDEXABLE_BLOCK_TYPES,
  type IndexDefinition,
} from "../src/lib/search/indexes";
import type {
  MeiliMessage,
  MeiliPage,
  MeiliBlock,
  MeiliUser,
} from "../src/lib/search/indexer";

const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const db = drizzle(pool, { schema });

const meili = new MeiliSearch({
  host: process.env.MEILI_HOST ?? "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureIndex(def: IndexDefinition): Promise<void> {
  try {
    await meili.getIndex(def.uid);
  } catch {
    console.log(`  Creating index "${def.uid}"...`);
    await meili.createIndex(def.uid, { primaryKey: def.primaryKey });
  }
  const idx = meili.index(def.uid);
  await idx.updateSettings({
    searchableAttributes: def.searchableAttributes,
    filterableAttributes: def.filterableAttributes,
  });
}

async function upsertBatch(uid: string, docs: Record<string, unknown>[]): Promise<void> {
  if (docs.length === 0) return;
  await meili.index(uid).addDocuments(docs);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Per-index reindex functions
// ---------------------------------------------------------------------------

async function reindexMessages(): Promise<void> {
  console.log("\n[messages] Starting reindex...");
  await ensureIndex(INDEX_MESSAGES);

  let offset = 0;
  let total = 0;

  while (true) {
    const rows = await db
      .select({
        id: schema.messages.id,
        content: schema.messages.content,
        channelId: schema.messages.channelId,
        conversationId: schema.messages.conversationId,
        senderId: schema.messages.userId,
        createdAt: schema.messages.createdAt,
        senderName: schema.users.displayName,
        channelWorkspaceId: schema.channels.workspaceId,
      })
      .from(schema.messages)
      .leftJoin(schema.users, eq(schema.messages.userId, schema.users.id))
      .leftJoin(schema.channels, eq(schema.messages.channelId, schema.channels.id))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const docs: MeiliMessage[] = rows.map((r) => ({
      id: r.id,
      content: r.content,
      senderName: r.senderName ?? null,
      workspaceId: r.channelWorkspaceId ?? null,
      channelId: r.channelId ?? null,
      conversationId: r.conversationId ?? null,
      senderId: r.senderId,
      createdAt: r.createdAt.getTime(),
    }));

    await upsertBatch(INDEX_MESSAGES.uid, docs as unknown as Record<string, unknown>[]);
    total += docs.length;
    offset += BATCH_SIZE;
    console.log(`  [messages] Indexed ${total} so far...`);

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[messages] Done — ${total} documents indexed.`);
}

async function reindexPages(): Promise<void> {
  console.log("\n[pages] Starting reindex...");
  await ensureIndex(INDEX_PAGES);

  let offset = 0;
  let total = 0;

  while (true) {
    // "Pages" are blocks of type='page'
    const rows = await db
      .select({
        id: schema.blocks.id,
        workspaceId: schema.blocks.workspaceId,
        archived: schema.blocks.archived,
        createdBy: schema.blocks.createdBy,
        properties: schema.blocks.properties,
        createdAt: schema.blocks.createdAt,
      })
      .from(schema.blocks)
      .where(eq(schema.blocks.type, "page"))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const docs: MeiliPage[] = rows.map((r) => {
      const props = r.properties as Record<string, unknown>;
      // title is typically stored in properties.title[0][0] (Notion-style rich text)
      const titleRaw = props?.title;
      let title = "";
      if (typeof titleRaw === "string") {
        title = titleRaw;
      } else if (Array.isArray(titleRaw) && Array.isArray(titleRaw[0])) {
        title = String((titleRaw as unknown[][])[0][0] ?? "");
      } else if (Array.isArray(titleRaw)) {
        title = titleRaw.join("");
      }

      // topic may live in properties or on the canvas row — best-effort from properties
      const topic =
        typeof props?.topic === "string" ? props.topic : null;

      return {
        id: r.id,
        title: title || "(untitled)",
        topic,
        workspaceId: r.workspaceId,
        archived: r.archived,
        createdBy: r.createdBy,
      };
    });

    await upsertBatch(INDEX_PAGES.uid, docs as unknown as Record<string, unknown>[]);
    total += docs.length;
    offset += BATCH_SIZE;
    console.log(`  [pages] Indexed ${total} so far...`);

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[pages] Done — ${total} documents indexed.`);
}

async function reindexBlocks(): Promise<void> {
  console.log("\n[blocks] Starting reindex...");
  await ensureIndex(INDEX_BLOCKS);

  const indexableTypes = Array.from(INDEXABLE_BLOCK_TYPES) as schema.BlockType[];
  let offset = 0;
  let total = 0;
  let skipped = 0;

  while (true) {
    const rows = await db
      .select({
        id: schema.blocks.id,
        type: schema.blocks.type,
        workspaceId: schema.blocks.workspaceId,
        pageId: schema.blocks.pageId,
        properties: schema.blocks.properties,
        content: schema.blocks.content,
      })
      .from(schema.blocks)
      .where(inArray(schema.blocks.type, indexableTypes))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const docs: MeiliBlock[] = [];
    for (const r of rows) {
      // Extract plain text from properties.title or content
      const props = r.properties as Record<string, unknown>;
      let text = "";

      const titleRaw = props?.title;
      if (typeof titleRaw === "string") {
        text = titleRaw;
      } else if (Array.isArray(titleRaw)) {
        // Flatten Notion-style [[text, annotations], ...] rich text
        text = (titleRaw as unknown[][])
          .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : String(seg)))
          .join("");
      }

      if (!text.trim()) {
        skipped++;
        continue;
      }

      docs.push({
        id: r.id,
        text: text.trim(),
        type: r.type,
        workspaceId: r.workspaceId,
        pageId: r.pageId,
      });
    }

    if (docs.length > 0) {
      await upsertBatch(INDEX_BLOCKS.uid, docs as unknown as Record<string, unknown>[]);
    }
    total += docs.length;
    offset += BATCH_SIZE;
    console.log(`  [blocks] Indexed ${total} so far (skipped empty: ${skipped})...`);

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[blocks] Done — ${total} documents indexed, ${skipped} empty blocks skipped.`);
}

async function reindexUsers(): Promise<void> {
  console.log("\n[users] Starting reindex...");
  await ensureIndex(INDEX_USERS);

  let offset = 0;
  let total = 0;

  while (true) {
    const rows = await db
      .select({
        id: schema.users.id,
        displayName: schema.users.displayName,
        ainAddress: schema.users.ainAddress,
        isAgent: schema.users.isAgent,
      })
      .from(schema.users)
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const docs: MeiliUser[] = rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      ainAddress: r.ainAddress,
      isAgent: r.isAgent,
    }));

    await upsertBatch(INDEX_USERS.uid, docs as unknown as Record<string, unknown>[]);
    total += docs.length;
    offset += BATCH_SIZE;
    console.log(`  [users] Indexed ${total} so far...`);

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[users] Done — ${total} documents indexed.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const indexArg =
    process.argv
      .find((a) => a.startsWith("--index="))
      ?.replace("--index=", "") ?? "all";

  console.log(`Meilisearch reindex — target: ${indexArg}`);
  console.log(`Host: ${process.env.MEILI_HOST ?? "http://localhost:7700"}`);

  const start = Date.now();

  try {
    // Verify Meili is reachable
    await meili.health();
    console.log("Meilisearch is healthy. Starting...\n");
  } catch (err) {
    console.error("Cannot reach Meilisearch:", err);
    process.exit(1);
  }

  const tasks: (() => Promise<void>)[] = [];

  if (indexArg === "all" || indexArg === "messages") tasks.push(reindexMessages);
  if (indexArg === "all" || indexArg === "pages") tasks.push(reindexPages);
  if (indexArg === "all" || indexArg === "blocks") tasks.push(reindexBlocks);
  if (indexArg === "all" || indexArg === "users") tasks.push(reindexUsers);

  if (tasks.length === 0) {
    console.error(`Unknown --index value: "${indexArg}". Use messages|pages|blocks|users|all`);
    process.exit(1);
  }

  for (const task of tasks) {
    await task();
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nAll done in ${elapsed}s.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
