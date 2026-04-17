/**
 * Migrator: existing `canvases.content` (markdown text) → Notion block tree.
 *
 * Runs after migration 0010 has landed the blocks tables. For each canvas
 * without a pageId:
 *   1. Create a root page block (type='page') with canvas.title.
 *   2. Parse markdown into a flat list of block descriptors.
 *   3. Insert blocks with parent_id = pageId, children_order maintained.
 *   4. Set canvases.page_id = newPage.id.
 *
 * Idempotent: skips canvases that already have a page_id.
 *
 * Usage:
 *   cd slack && npx tsx scripts/migrate-canvas-to-blocks.ts [--dry-run]
 */

import { db } from '../src/lib/db';
import { canvases, blocks } from '../src/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { parseMarkdownToBlocks } from '../src/lib/notion/export/markdown-to-blocks';

// ── DB writes ─────────────────────────────────────────────────────────────────

async function migrateOne(canvas: typeof canvases.$inferSelect, opts: { dryRun: boolean }): Promise<string | null> {
  if (canvas.pageId) return null; // already migrated

  const draftBlocks = parseMarkdownToBlocks(canvas.content || '');

  if (opts.dryRun) {
    console.log(`[dry] ${canvas.id}: "${canvas.title}" → ${draftBlocks.length} blocks`);
    return null;
  }

  return await db.transaction(async (tx) => {
    // Root page block
    const [page] = await tx
      .insert(blocks)
      .values({
        type: 'page',
        parentId: null,
        pageId: '00000000-0000-0000-0000-000000000000', // placeholder; set to self after insert
        workspaceId: canvas.workspaceId,
        properties: { title: canvas.title, topic: canvas.topic },
        content: {},
        childrenOrder: [],
        createdBy: canvas.createdBy,
      })
      .returning();

    // page_id must point at itself; drizzle/pg doesn't let us reference the new id in the same insert
    await tx.update(blocks).set({ pageId: page.id }).where(eq(blocks.id, page.id));

    // Child blocks
    const childIds: string[] = [];
    for (const d of draftBlocks) {
      const [child] = await tx
        .insert(blocks)
        .values({
          type: d.type,
          parentId: page.id,
          pageId: page.id,
          workspaceId: canvas.workspaceId,
          properties: d.properties ?? {},
          content: d.content,
          childrenOrder: [],
          createdBy: canvas.createdBy,
        })
        .returning({ id: blocks.id });
      childIds.push(child.id);
    }

    await tx.update(blocks).set({ childrenOrder: childIds }).where(eq(blocks.id, page.id));
    await tx.update(canvases).set({ pageId: page.id }).where(eq(canvases.id, canvas.id));

    return page.id;
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rows = await db
    .select()
    .from(canvases)
    .where(and(isNull(canvases.pageId)));

  console.log(`${dryRun ? '[dry-run] ' : ''}Migrating ${rows.length} canvases without pageId…`);
  let migrated = 0;
  for (const canvas of rows) {
    try {
      const pageId = await migrateOne(canvas, { dryRun });
      if (pageId) {
        console.log(`✓ ${canvas.id} → page ${pageId}`);
        migrated++;
      }
    } catch (err) {
      console.error(`✗ ${canvas.id}:`, err);
    }
  }
  console.log(`\nDone. ${dryRun ? 'Would migrate' : 'Migrated'} ${migrated}/${rows.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
