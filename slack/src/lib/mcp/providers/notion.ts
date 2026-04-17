// Notion internal MCP provider — exposes Notion-core tools as MCP tools.
// Operates directly against the drizzle DB; no subprocess or network hop.
// Auth: every mutating tool requires userId + verifies workspace membership
// or explicit page permission via the shared page-access helpers.

import { db } from '@/lib/db';
import {
  blocks,
  blockComments,
  databaseViews,
  workspaceMembers,
} from '@/lib/db/schema';
import type { BlockType, ViewType } from '@/lib/db/schema';
import { eq, and, ilike, inArray, sql } from 'drizzle-orm';
import { getPage, canAccess } from '@/lib/notion/page-access';
import { parseMarkdownToBlocks } from '@/lib/notion/export/markdown-to-blocks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function isMember(workspaceId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm;
}

// ─── pages.create ─────────────────────────────────────────────────────────────

export async function pages_create(params: {
  workspaceId: string;
  title?: string;
  parentPageId?: string;
  icon?: string;
  properties?: Record<string, unknown>;
  userId?: string;
}): Promise<string> {
  if (!params.workspaceId) return 'workspaceId is required.';
  if (!(await isMember(params.workspaceId, params.userId))) {
    return 'Forbidden: not a workspace member.';
  }
  try {
    const createdBy = params.userId!;
    const props: Record<string, unknown> = {
      title: params.title ?? 'Untitled',
      ...(params.icon ? { icon: params.icon } : {}),
      ...(params.properties ?? {}),
    };
    const [page] = await db
      .insert(blocks)
      .values({
        type: 'page' as BlockType,
        parentId: params.parentPageId ?? null,
        pageId: '00000000-0000-0000-0000-000000000000',
        workspaceId: params.workspaceId,
        properties: props,
        content: {},
        childrenOrder: [],
        createdBy,
      })
      .returning();

    // pageId self-references the block id for root pages
    await db
      .update(blocks)
      .set({ pageId: page.id, parentId: params.parentPageId ?? null })
      .where(eq(blocks.id, page.id));

    // If nested, add to parent's childrenOrder
    if (params.parentPageId) {
      const [parent] = await db
        .select()
        .from(blocks)
        .where(eq(blocks.id, params.parentPageId))
        .limit(1);
      if (parent) {
        const nextOrder = [...(parent.childrenOrder ?? []), page.id];
        await db.update(blocks).set({ childrenOrder: nextOrder }).where(eq(blocks.id, parent.id));
      }
    }

    return `Page created: **${props.title}** (ID: \`${page.id}\`)`;
  } catch (err) {
    return `Failed to create page: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── pages.createFromMarkdown ────────────────────────────────────────────────
//
// Convenience wrapper: create a page, parse the markdown body into a block
// tree, and insert the children — all in one transaction. Optionally links
// the new page to a canvas row (`canvasId`) and stamps an initial pipeline
// status on BOTH the page block properties and (via Agent Z's helper, when
// available) the legacy canvases.pipelineStatus column.
//
// Why: most callers (newsroom agents, workflow steps, importers) don't want
// to string together pages_create + 5-20 blocks_append calls. This tool is
// the one-shot entry point; low-level tools remain available for edits.

export async function pages_create_from_markdown(params: {
  workspaceId: string;
  title: string;
  markdown: string;
  parentPageId?: string;
  icon?: string;
  properties?: Record<string, unknown>;
  // Optional: stamp an initial pipeline status on the page properties (and
  // dual-write to the legacy canvas column when canvasId is supplied).
  pipelineStatus?: 'draft' | 'edited' | 'fact-checked' | 'published';
  // Optional: link this page back to an existing canvas (sets canvases.page_id
  // in the same transaction). When set together with pipelineStatus, both the
  // canvas row and the page block carry the same status.
  canvasId?: string;
  userId?: string;
}): Promise<string> {
  if (!params.workspaceId) return 'workspaceId is required.';
  if (!params.title) return 'title is required.';
  if (params.markdown === undefined) return 'markdown is required.';
  if (!(await isMember(params.workspaceId, params.userId))) {
    return 'Forbidden: not a workspace member.';
  }

  try {
    const createdBy = params.userId!;
    const draftBlocks = parseMarkdownToBlocks(params.markdown || '');

    const initialProps: Record<string, unknown> = {
      title: params.title,
      ...(params.icon ? { icon: params.icon } : {}),
      ...(params.pipelineStatus ? { status: params.pipelineStatus } : {}),
      ...(params.properties ?? {}),
    };

    const { pageId, childCount } = await db.transaction(async (tx) => {
      // 1. Root page block (self-referencing page_id — placeholder replaced below)
      const [page] = await tx
        .insert(blocks)
        .values({
          type: 'page' as BlockType,
          parentId: params.parentPageId ?? null,
          pageId: '00000000-0000-0000-0000-000000000000',
          workspaceId: params.workspaceId,
          properties: initialProps,
          content: {},
          childrenOrder: [],
          createdBy,
        })
        .returning();

      await tx.update(blocks).set({ pageId: page.id }).where(eq(blocks.id, page.id));

      // 2. Child blocks from parsed markdown
      const childIds: string[] = [];
      for (const d of draftBlocks) {
        const [child] = await tx
          .insert(blocks)
          .values({
            type: d.type,
            parentId: page.id,
            pageId: page.id,
            workspaceId: params.workspaceId,
            properties: d.properties ?? {},
            content: d.content,
            childrenOrder: [],
            createdBy,
          })
          .returning({ id: blocks.id });
        childIds.push(child.id);
      }

      await tx
        .update(blocks)
        .set({ childrenOrder: childIds })
        .where(eq(blocks.id, page.id));

      // 3. If nested under a parent page, append to parent's childrenOrder
      if (params.parentPageId) {
        const [parent] = await tx
          .select()
          .from(blocks)
          .where(eq(blocks.id, params.parentPageId))
          .limit(1);
        if (parent) {
          const nextOrder = [...(parent.childrenOrder ?? []), page.id];
          await tx
            .update(blocks)
            .set({ childrenOrder: nextOrder })
            .where(eq(blocks.id, parent.id));
        }
      }

      // 4. Link back to canvas (if provided). We use raw SQL for the
      //    `page_id` column because the drizzle schema (owned by another
      //    agent) hasn't been updated to expose that field yet — the
      //    migration has landed on the DB side. Keep this until schema
      //    types catch up.
      if (params.canvasId) {
        await tx.execute(
          sql`UPDATE canvases SET page_id = ${page.id}::uuid WHERE id = ${params.canvasId}::uuid`,
        );
      }

      return { pageId: page.id, childCount: childIds.length };
    });

    // 5. Best-effort pipeline-status dual-write via Agent Z's helper when a
    //    canvasId + status are supplied. Defensive: the helper may not exist
    //    at runtime; page-side `properties.status` is already set inline
    //    above so the page stays consistent even if this step is skipped.
    if (params.canvasId && params.pipelineStatus) {
      try {
        const mod = (await import('@/lib/notion/pipeline-status')) as {
          setPipelineStatus?: (
            canvasId: string,
            status: typeof params.pipelineStatus,
          ) => Promise<void>;
        };
        if (typeof mod.setPipelineStatus === 'function') {
          await mod.setPipelineStatus(params.canvasId, params.pipelineStatus);
        }
      } catch {
        // pipeline-status module not present — safe to ignore.
      }
    }

    return `Page created from markdown: **${params.title}** (ID: \`${pageId}\`, ${childCount} blocks)`;
  } catch (err) {
    return `Failed to create page from markdown: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── pages.get ────────────────────────────────────────────────────────────────

export async function pages_get(params: {
  pageId: string;
  userId?: string;
}): Promise<string> {
  if (!params.pageId) return 'pageId is required.';
  try {
    const page = await getPage(params.pageId);
    if (!page) return 'Page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'view'))) {
      return 'Forbidden: no read access to this page.';
    }
    const children = await db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, page.id));
    return JSON.stringify({ page, childCount: children.length });
  } catch (err) {
    return `Failed to get page: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── pages.update ─────────────────────────────────────────────────────────────

export async function pages_update(params: {
  pageId: string;
  title?: string;
  icon?: string;
  cover?: string;
  archived?: boolean;
  userId?: string;
}): Promise<string> {
  if (!params.pageId) return 'pageId is required.';
  try {
    const page = await getPage(params.pageId);
    if (!page) return 'Page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'edit'))) {
      return 'Forbidden: no edit access to this page.';
    }
    const propUpdates: Record<string, unknown> = { ...(page.properties as Record<string, unknown>) };
    if (params.title !== undefined) propUpdates.title = params.title;
    if (params.icon !== undefined) propUpdates.icon = params.icon;
    if (params.cover !== undefined) propUpdates.cover = params.cover;

    const updates: Partial<typeof blocks.$inferInsert> = {
      properties: propUpdates,
      updatedAt: new Date(),
    };
    if (params.archived !== undefined) updates.archived = params.archived;

    const [updated] = await db
      .update(blocks)
      .set(updates)
      .where(eq(blocks.id, params.pageId))
      .returning();

    return `Page updated: **${(updated.properties as Record<string, unknown>).title ?? updated.id}**`;
  } catch (err) {
    return `Failed to update page: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── pages.delete ─────────────────────────────────────────────────────────────

export async function pages_delete(params: {
  pageId: string;
  hard?: boolean;
  userId?: string;
}): Promise<string> {
  if (!params.pageId) return 'pageId is required.';
  try {
    const page = await getPage(params.pageId);
    if (!page) return 'Page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'edit'))) {
      return 'Forbidden: no edit access to this page.';
    }
    if (params.hard) {
      await db.delete(blocks).where(eq(blocks.id, params.pageId));
      return `Page \`${params.pageId}\` permanently deleted.`;
    } else {
      await db
        .update(blocks)
        .set({ archived: true, updatedAt: new Date() })
        .where(eq(blocks.id, params.pageId));
      return `Page \`${params.pageId}\` archived.`;
    }
  } catch (err) {
    return `Failed to delete page: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── pages.query ─────────────────────────────────────────────────────────────

export async function pages_query(params: {
  workspaceId: string;
  q?: string;
  limit?: number;
  userId?: string;
}): Promise<string> {
  if (!params.workspaceId) return 'workspaceId is required.';
  if (!(await isMember(params.workspaceId, params.userId))) {
    return 'Forbidden: not a workspace member.';
  }
  try {
    const limit = Math.min(params.limit ?? 50, 200);
    const conditions = [
      eq(blocks.workspaceId, params.workspaceId),
      eq(blocks.type, 'page' as BlockType),
      eq(blocks.archived, false),
      ...(params.q ? [ilike(blocks.properties, `%${params.q}%`)] : []),
    ];
    const rows = await db
      .select({ id: blocks.id, properties: blocks.properties, createdAt: blocks.createdAt })
      .from(blocks)
      .where(and(...conditions))
      .limit(limit);

    if (rows.length === 0) return 'No pages found.';
    const lines = rows.map((r) => {
      const title = (r.properties as Record<string, unknown>).title ?? 'Untitled';
      return `- **${title}** (\`${r.id}\`)`;
    });
    return `**Pages (${rows.length})**\n\n${lines.join('\n')}`;
  } catch (err) {
    return `Failed to query pages: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── blocks.append ───────────────────────────────────────────────────────────

export async function blocks_append(params: {
  pageId: string;
  type: string;
  content?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  parentId?: string;
  afterBlockId?: string;
  userId?: string;
}): Promise<string> {
  if (!params.pageId) return 'pageId is required.';
  if (!params.type) return 'type is required.';
  try {
    const page = await getPage(params.pageId);
    if (!page) return 'Page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'edit'))) {
      return 'Forbidden: no edit access.';
    }
    const createdBy = params.userId ?? page.createdBy;
    const effectiveParentId = params.parentId ?? params.pageId;

    const [block] = await db
      .insert(blocks)
      .values({
        type: params.type as BlockType,
        parentId: effectiveParentId,
        pageId: params.pageId,
        workspaceId: page.workspaceId,
        properties: params.properties ?? {},
        content: params.content ?? {},
        childrenOrder: [],
        createdBy,
      })
      .returning();

    // Update parent childrenOrder
    const [parent] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, effectiveParentId))
      .limit(1);
    if (parent) {
      const order = [...(parent.childrenOrder ?? [])];
      if (params.afterBlockId) {
        const idx = order.indexOf(params.afterBlockId);
        if (idx >= 0) {
          order.splice(idx + 1, 0, block.id);
        } else {
          order.push(block.id);
        }
      } else {
        order.push(block.id);
      }
      await db.update(blocks).set({ childrenOrder: order }).where(eq(blocks.id, parent.id));
    }

    return `Block appended: \`${block.id}\` (type: ${block.type})`;
  } catch (err) {
    return `Failed to append block: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── blocks.get ──────────────────────────────────────────────────────────────

export async function blocks_get(params: {
  blockId: string;
  userId?: string;
}): Promise<string> {
  if (!params.blockId) return 'blockId is required.';
  try {
    const [block] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, params.blockId))
      .limit(1);
    if (!block) return 'Block not found.';
    if (!(await isMember(block.workspaceId, params.userId))) {
      return 'Forbidden: not a workspace member.';
    }
    return JSON.stringify(block);
  } catch (err) {
    return `Failed to get block: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── blocks.update ───────────────────────────────────────────────────────────

export async function blocks_update(params: {
  blockId: string;
  properties?: Record<string, unknown>;
  content?: Record<string, unknown>;
  childrenOrder?: string[];
  archived?: boolean;
  userId?: string;
}): Promise<string> {
  if (!params.blockId) return 'blockId is required.';
  try {
    const [block] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, params.blockId))
      .limit(1);
    if (!block) return 'Block not found.';

    const page = await getPage(block.pageId);
    if (!page) return 'Parent page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'edit'))) {
      return 'Forbidden: no edit access.';
    }

    const updates: Partial<typeof blocks.$inferInsert> = { updatedAt: new Date() };
    if (params.properties !== undefined) updates.properties = params.properties;
    if (params.content !== undefined) updates.content = params.content;
    if (params.childrenOrder !== undefined) updates.childrenOrder = params.childrenOrder;
    if (params.archived !== undefined) updates.archived = params.archived;

    const [updated] = await db
      .update(blocks)
      .set(updates)
      .where(eq(blocks.id, params.blockId))
      .returning();

    return `Block \`${updated.id}\` updated.`;
  } catch (err) {
    return `Failed to update block: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── blocks.delete ───────────────────────────────────────────────────────────

export async function blocks_delete(params: {
  blockId: string;
  userId?: string;
}): Promise<string> {
  if (!params.blockId) return 'blockId is required.';
  try {
    const [block] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, params.blockId))
      .limit(1);
    if (!block) return 'Block not found.';

    const page = await getPage(block.pageId);
    if (!page) return 'Parent page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'edit'))) {
      return 'Forbidden: no edit access.';
    }

    await db.transaction(async (tx) => {
      if (block.parentId) {
        const [parent] = await tx
          .select()
          .from(blocks)
          .where(eq(blocks.id, block.parentId))
          .limit(1);
        if (parent) {
          const nextOrder = (parent.childrenOrder ?? []).filter((id) => id !== params.blockId);
          await tx.update(blocks).set({ childrenOrder: nextOrder }).where(eq(blocks.id, parent.id));
        }
      }
      await tx.delete(blocks).where(eq(blocks.id, params.blockId));
    });

    return `Block \`${params.blockId}\` deleted.`;
  } catch (err) {
    return `Failed to delete block: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── databases.query ─────────────────────────────────────────────────────────

export async function databases_query(params: {
  databaseBlockId: string;
  filter?: { logic?: string; conditions?: unknown[] };
  sort?: unknown[];
  limit?: number;
  userId?: string;
}): Promise<string> {
  if (!params.databaseBlockId) return 'databaseBlockId is required.';
  try {
    const [dbBlock] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, params.databaseBlockId))
      .limit(1);
    if (!dbBlock) return 'Database block not found.';
    if (dbBlock.type !== 'database') return 'Block is not a database.';

    if (!(await isMember(dbBlock.workspaceId, params.userId))) {
      return 'Forbidden: not a workspace member.';
    }

    const limit = Math.min(params.limit ?? 50, 200);
    const rows = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.parentId, params.databaseBlockId), eq(blocks.archived, false)))
      .limit(limit);

    if (rows.length === 0) return 'No rows found in this database.';
    return JSON.stringify({ rows, total: rows.length });
  } catch (err) {
    return `Failed to query database: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── databases.addView ───────────────────────────────────────────────────────

export async function databases_addView(params: {
  databaseBlockId: string;
  name: string;
  type: string;
  filters?: { logic?: string; conditions?: unknown[] };
  sorts?: unknown[];
  groupBy?: unknown;
  config?: { visibleProperties?: string[] };
  userId?: string;
}): Promise<string> {
  if (!params.databaseBlockId) return 'databaseBlockId is required.';
  if (!params.name) return 'name is required.';
  if (!params.type) return 'type is required.';
  try {
    const [dbBlock] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, params.databaseBlockId))
      .limit(1);
    if (!dbBlock) return 'Database block not found.';
    if (dbBlock.type !== 'database') return 'Block is not a database.';

    const page = await getPage(dbBlock.pageId);
    if (!page) return 'Parent page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'edit'))) {
      return 'Forbidden: no edit access.';
    }

    const existing = await db
      .select({ position: databaseViews.position })
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, params.databaseBlockId));
    const maxPos = existing.reduce((max, v) => Math.max(max, v.position), -1);

    const VALID_VIEW_TYPES = new Set<ViewType>([
      'table', 'board', 'list', 'calendar', 'gallery', 'timeline',
    ]);
    const viewType: ViewType =
      VALID_VIEW_TYPES.has(params.type as ViewType) ? (params.type as ViewType) : 'table';

    const [created] = await db
      .insert(databaseViews)
      .values({
        databaseId: params.databaseBlockId,
        name: params.name,
        type: viewType,
        filters: {
          logic: (params.filters?.logic as 'and' | 'or') ?? 'and',
          conditions: params.filters?.conditions ?? [],
        },
        sorts: params.sorts ?? [],
        groupBy: params.groupBy ?? null,
        config: { visibleProperties: params.config?.visibleProperties ?? [] },
        position: maxPos + 1,
      })
      .returning();

    return `View "${created.name}" (${created.type}) created for database \`${params.databaseBlockId}\`.`;
  } catch (err) {
    return `Failed to add view: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── comments.create ─────────────────────────────────────────────────────────

export async function comments_create(params: {
  blockId: string;
  content: string | Record<string, unknown>;
  threadId?: string;
  userId?: string;
}): Promise<string> {
  if (!params.blockId) return 'blockId is required.';
  if (!params.content) return 'content is required.';
  if (!params.userId) return 'userId is required.';
  try {
    const [block] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, params.blockId))
      .limit(1);
    if (!block) return 'Block not found.';

    const pageId = block.type === 'page' ? block.id : block.pageId;
    const page = await getPage(pageId);
    if (!page) return 'Page not found.';
    if (!(await canAccess(params.userId, page, 'comment'))) {
      return 'Forbidden: no comment access.';
    }

    const contentJson =
      typeof params.content === 'string' ? { text: params.content } : params.content;

    const [comment] = await db
      .insert(blockComments)
      .values({
        blockId: params.blockId,
        authorId: params.userId,
        content: contentJson,
        resolved: false,
        threadId: params.threadId ?? null,
      })
      .returning();

    return `Comment created: \`${comment.id}\``;
  } catch (err) {
    return `Failed to create comment: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── comments.resolve ────────────────────────────────────────────────────────

export async function comments_resolve(params: {
  commentId: string;
  userId?: string;
}): Promise<string> {
  if (!params.commentId) return 'commentId is required.';
  try {
    const [comment] = await db
      .select()
      .from(blockComments)
      .where(eq(blockComments.id, params.commentId))
      .limit(1);
    if (!comment) return 'Comment not found.';

    const [block] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, comment.blockId))
      .limit(1);
    if (!block) return 'Parent block not found.';

    const pageId = block.type === 'page' ? block.id : block.pageId;
    const page = await getPage(pageId);
    if (!page) return 'Page not found.';
    if (!(await canAccess(params.userId ?? '', page, 'comment'))) {
      return 'Forbidden: no comment access.';
    }

    await db
      .update(blockComments)
      .set({ resolved: true, updatedAt: new Date() })
      .where(eq(blockComments.id, params.commentId));

    return `Comment \`${params.commentId}\` resolved.`;
  } catch (err) {
    return `Failed to resolve comment: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

// ─── search ──────────────────────────────────────────────────────────────────

export async function search(params: {
  workspaceId: string;
  q: string;
  types?: string[];
  limit?: number;
  userId?: string;
}): Promise<string> {
  if (!params.workspaceId) return 'workspaceId is required.';
  if (!params.q?.trim()) return 'q is required.';
  if (!(await isMember(params.workspaceId, params.userId))) {
    return 'Forbidden: not a workspace member.';
  }
  try {
    const limit = Math.min(params.limit ?? 50, 200);
    const ALLOWED: BlockType[] = ['page', 'database'];
    const typeFilter =
      params.types && params.types.length > 0
        ? params.types.filter((t): t is BlockType => ALLOWED.includes(t as BlockType))
        : ALLOWED;

    const rows = await db
      .select({ id: blocks.id, type: blocks.type, properties: blocks.properties })
      .from(blocks)
      .where(
        and(
          eq(blocks.workspaceId, params.workspaceId),
          eq(blocks.archived, false),
          inArray(blocks.type, typeFilter),
          ilike(blocks.properties, `%${params.q}%`)
        )
      )
      .limit(limit);

    if (rows.length === 0) return `No results for "${params.q}".`;

    const lines = rows.map((r) => {
      const title = (r.properties as Record<string, unknown>).title ?? 'Untitled';
      return `- [${r.type}] **${title}** (\`${r.id}\`)`;
    });
    return `**Search: "${params.q}" (${rows.length} results)**\n\n${lines.join('\n')}`;
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
