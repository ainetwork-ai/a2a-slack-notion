import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  blocks,
  recentPages,
} from '../../../../slack/src/lib/db/schema';
import { requirePermission } from '../middleware/require-permission.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import { indexPage } from '../lib/search.js';
import type { AppVariables } from '../types/app.js';
import type { PaginatedResponse } from '../lib/pagination.js';

const pages = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

const CreatePageSchema = z.object({
  title: z.string().default('Untitled'),
  parentId: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
});

const UpdatePageSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  archived: z.boolean().optional(),
});

// List workspace pages (tree roots — pages without a page parent)
pages.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const startCursorEncoded = c.req.query('start_cursor');
  const pageSizeParam = c.req.query('page_size');
  const usePagination = startCursorEncoded !== undefined || pageSizeParam !== undefined;
  const pageSize = Math.min(Number(pageSizeParam ?? 50), 100);

  const cursorId = startCursorEncoded ? decodeCursor(startCursorEncoded) : undefined;

  // Base where clause: workspace, page type, not archived, no parent
  const baseWhere = and(
    eq(blocks.workspaceId, workspaceId),
    eq(blocks.type, 'page'),
    eq(blocks.archived, false),
    isNull(blocks.parentId),
  );

  // For cursor pagination we look up the cursor row's createdAt then filter by
  // (createdAt > cursor) to emulate Prisma `cursor + skip: 1`.
  let whereClause = baseWhere;
  if (usePagination && cursorId) {
    const cursorRow = await db
      .select({ createdAt: blocks.createdAt })
      .from(blocks)
      .where(eq(blocks.id, cursorId))
      .limit(1)
      .then((r) => r[0]);
    if (cursorRow) {
      whereClause = and(baseWhere, gt(blocks.createdAt, cursorRow.createdAt));
    }
  }

  const rootPagesQuery = db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      createdBy: blocks.createdBy,
      createdAt: blocks.createdAt,
      updatedAt: blocks.updatedAt,
      childrenOrder: blocks.childrenOrder,
    })
    .from(blocks)
    .where(whereClause)
    .orderBy(asc(blocks.createdAt));

  const rootPages = usePagination
    ? await rootPagesQuery.limit(pageSize + 1)
    : await rootPagesQuery;

  const mapped = rootPages.map((p) => ({
    id: p.id,
    ...(p.properties as Record<string, unknown>),
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    hasChildren: p.childrenOrder.length > 0,
  }));

  if (!usePagination) {
    return c.json(mapped);
  }

  const hasMore = mapped.length > pageSize;
  const results = hasMore ? mapped.slice(0, pageSize) : mapped;
  const lastResult = results[results.length - 1];
  const nextCursor = hasMore && lastResult ? encodeCursor(lastResult.id) : null;

  const response: PaginatedResponse<typeof results[number]> = {
    object: 'list',
    results,
    has_more: hasMore,
    next_cursor: nextCursor,
  };

  return c.json(response);
});

// Get page with children
pages.get('/:pageId', requirePermission('can_view'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page || page.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  const children = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.parentId, pageId), eq(blocks.archived, false)))
    .orderBy(asc(blocks.createdAt));

  const ordered = page.childrenOrder.length > 0
    ? page.childrenOrder
        .map((id) => children.find((ch) => ch.id === id))
        .filter(Boolean)
    : children;

  // Track recent visit (upsert)
  const existingRecent = await db
    .select()
    .from(recentPages)
    .where(and(eq(recentPages.userId, user.id), eq(recentPages.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (existingRecent) {
    await db
      .update(recentPages)
      .set({ visitedAt: new Date() })
      .where(eq(recentPages.id, existingRecent.id));
  } else {
    await db.insert(recentPages).values({
      userId: user.id,
      workspaceId: page.workspaceId,
      pageId,
    });
  }

  return c.json({
    ...page,
    ...(page.properties as Record<string, unknown>),
    children: ordered,
  });
});

// Get child pages (for sidebar lazy loading)
pages.get('/:pageId/children', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await db
    .select({ childrenOrder: blocks.childrenOrder })
    .from(blocks)
    .where(eq(blocks.id, pageId))
    .limit(1)
    .then((r) => r[0]);

  if (!page) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);

  const childPages = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      childrenOrder: blocks.childrenOrder,
      createdAt: blocks.createdAt,
      updatedAt: blocks.updatedAt,
    })
    .from(blocks)
    .where(
      and(
        eq(blocks.parentId, pageId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
      ),
    );

  return c.json(
    childPages.map((p) => ({
      id: p.id,
      ...(p.properties as Record<string, unknown>),
      hasChildren: p.childrenOrder.length > 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  );
});

// Create page
pages.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const body = await c.req.json();
  const parsed = CreatePageSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const { title, parentId, icon, coverUrl } = parsed.data;

  // Create the page block — pageId is NOT NULL in slack schema; use workspaceId as placeholder and update after
  const inserted = await db
    .insert(blocks)
    .values({
      type: 'page',
      parentId: parentId ?? null,
      pageId: workspaceId,
      workspaceId,
      createdBy: user.id,
      properties: { title, icon: icon ?? null, coverUrl: coverUrl ?? null },
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  // Set pageId to self
  const updated = await db
    .update(blocks)
    .set({ pageId: inserted.id })
    .where(eq(blocks.id, inserted.id))
    .returning()
    .then((r) => r[0]!);

  // Add to parent's childrenOrder if nested
  if (parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, inserted.id] })
          .where(eq(blocks.id, parentId));
      }
    });
  }

  void indexPage({
    id: updated.id,
    workspaceId,
    title,
    textContent: '',
    createdBy: user.id,
    type: 'page',
    updatedAt: updated.updatedAt.toISOString(),
  });

  return c.json({ id: updated.id, ...(updated.properties as Record<string, unknown>) }, 201);
});

// Update page (rename, icon, cover, archive)
pages.patch('/:pageId', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdatePageSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);

  const props = (existing.properties ?? {}) as Record<string, unknown>;
  const updatedProps = { ...props };
  if (parsed.data.title !== undefined) updatedProps['title'] = parsed.data.title;
  if (parsed.data.icon !== undefined) updatedProps['icon'] = parsed.data.icon;
  if (parsed.data.coverUrl !== undefined) updatedProps['coverUrl'] = parsed.data.coverUrl;

  const page = await db
    .update(blocks)
    .set({
      properties: updatedProps,
      archived: parsed.data.archived ?? existing.archived,
      updatedAt: new Date(),
    })
    .where(eq(blocks.id, pageId))
    .returning()
    .then((r) => r[0]!);

  if (parsed.data.title !== undefined) {
    void indexPage({
      id: page.id,
      workspaceId: existing.workspaceId,
      title: parsed.data.title,
      textContent: '',
      createdBy: existing.createdBy,
      type: 'page',
      updatedAt: page.updatedAt.toISOString(),
    });
  }

  return c.json({ id: page.id, ...(page.properties as Record<string, unknown>), archived: page.archived });
});

// Delete page (soft delete — archive)
pages.delete('/:pageId', requirePermission('full_access'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);

  await db
    .update(blocks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocks.id, pageId));

  if (existing.parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, existing.parentId!))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: parent.childrenOrder.filter((id) => id !== pageId) })
          .where(eq(blocks.id, existing.parentId!));
      }
    });
  }

  return c.json({ object: 'page', id: pageId, archived: true });
});

// Breadcrumb — get ancestors chain
pages.get('/:pageId/breadcrumb', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();
  const ancestors: { id: string; title: string; icon: string | null }[] = [];

  let currentId: string | null = pageId;
  while (currentId) {
    const block: {
      id: string;
      properties: unknown;
      parentId: string | null;
      type: string;
    } | undefined = await db
      .select({
        id: blocks.id,
        properties: blocks.properties,
        parentId: blocks.parentId,
        type: blocks.type,
      })
      .from(blocks)
      .where(eq(blocks.id, currentId))
      .limit(1)
      .then((r) => r[0]);

    if (!block || block.type !== 'page') break;
    const props = (block.properties ?? {}) as Record<string, unknown>;
    ancestors.unshift({
      id: block.id,
      title: (props['title'] as string) ?? 'Untitled',
      icon: (props['icon'] as string) ?? null,
    });
    currentId = block.parentId;
  }

  return c.json(ancestors);
});

export { pages };
