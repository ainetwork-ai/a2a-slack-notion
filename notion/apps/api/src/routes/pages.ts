import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
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

  // Decode cursor to get the block id
  const cursorId = startCursorEncoded ? decodeCursor(startCursorEncoded) : undefined;

  const rootPages = await prisma.block.findMany({
    where: {
      workspaceId,
      type: 'page',
      archived: false,
      parentId: null,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      properties: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      childrenOrder: true,
    },
    ...(usePagination
      ? {
          take: pageSize + 1, // fetch one extra to determine has_more
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        }
      : {}),
  });

  const mapped = rootPages.map((p) => ({
    id: p.id,
    ...(p.properties as Record<string, unknown>),
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    hasChildren: p.childrenOrder.length > 0,
  }));

  if (!usePagination) {
    // Backwards compatible — return plain array
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

  const page = await prisma.block.findUnique({
    where: { id: pageId, type: 'page' },
  });

  if (!page || page.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);
  }

  // Get direct children (blocks and sub-pages)
  const children = await prisma.block.findMany({
    where: { parentId: pageId, archived: false },
    orderBy: { createdAt: 'asc' },
  });

  // Sort by childrenOrder if present
  const ordered = page.childrenOrder.length > 0
    ? page.childrenOrder
        .map((id) => children.find((ch) => ch.id === id))
        .filter(Boolean)
    : children;

  // Track recent visit
  await prisma.recentPage.upsert({
    where: { userId_pageId: { userId: user.id, pageId } },
    create: { userId: user.id, workspaceId: page.workspaceId, pageId },
    update: { visitedAt: new Date() },
  });

  return c.json({
    ...page,
    ...(page.properties as Record<string, unknown>),
    children: ordered,
  });
});

// Get child pages (for sidebar lazy loading — Decision #31)
pages.get('/:pageId/children', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const page = await prisma.block.findUnique({
    where: { id: pageId },
    select: { childrenOrder: true },
  });

  if (!page) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);

  const childPages = await prisma.block.findMany({
    where: { parentId: pageId, type: 'page', archived: false },
    select: {
      id: true,
      properties: true,
      childrenOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(childPages.map((p) => ({
    id: p.id,
    ...(p.properties as Record<string, unknown>),
    hasChildren: p.childrenOrder.length > 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  })));
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

  // Create the page block
  const page = await prisma.block.create({
    data: {
      type: 'page',
      parentId: parentId ?? null,
      pageId: '', // self-reference, will update
      workspaceId,
      createdBy: user.id,
      properties: { title, icon: icon ?? null, coverUrl: coverUrl ?? null },
      content: {},
    },
  });

  // Set pageId to self
  const updated = await prisma.block.update({
    where: { id: page.id },
    data: { pageId: page.id },
  });

  // Add to parent's childrenOrder if nested
  if (parentId) {
    await prisma.$transaction(async (tx) => {
      const parent = await tx.block.findUnique({
        where: { id: parentId },
        select: { childrenOrder: true },
      });
      if (parent) {
        await tx.block.update({
          where: { id: parentId },
          data: { childrenOrder: [...parent.childrenOrder, page.id] },
        });
      }
    });
  }

  // Index in search
  void indexPage({
    id: updated.id,
    workspaceId,
    title,
    textContent: '',
    createdBy: user.id,
    type: 'page',
    updatedAt: updated.updatedAt.toISOString(),
  });

  return c.json({ id: updated.id, ...updated.properties as Record<string, unknown> }, 201);
});

// Update page (rename, icon, cover, archive)
pages.patch('/:pageId', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdatePageSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const existing = await prisma.block.findUnique({ where: { id: pageId, type: 'page' } });
  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);

  const props = existing.properties as Record<string, unknown>;
  const updatedProps = { ...props };
  if (parsed.data.title !== undefined) updatedProps['title'] = parsed.data.title;
  if (parsed.data.icon !== undefined) updatedProps['icon'] = parsed.data.icon;
  if (parsed.data.coverUrl !== undefined) updatedProps['coverUrl'] = parsed.data.coverUrl;

  const page = await prisma.block.update({
    where: { id: pageId },
    data: {
      properties: updatedProps as Record<string, string | number | boolean | null>,
      archived: parsed.data.archived ?? existing.archived,
    },
  });

  // Re-index in search when title changes
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

  return c.json({ id: page.id, ...page.properties as Record<string, unknown>, archived: page.archived });
});

// Delete page (soft delete — archive)
pages.delete('/:pageId', requirePermission('full_access'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { pageId } = c.req.param();

  const existing = await prisma.block.findUnique({ where: { id: pageId, type: 'page' } });
  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Page not found' }, 404);

  // Soft delete — set archived
  await prisma.block.update({
    where: { id: pageId },
    data: { archived: true },
  });

  // Remove from parent's childrenOrder
  if (existing.parentId) {
    await prisma.$transaction(async (tx) => {
      const parent = await tx.block.findUnique({
        where: { id: existing.parentId! },
        select: { childrenOrder: true },
      });
      if (parent) {
        await tx.block.update({
          where: { id: existing.parentId! },
          data: { childrenOrder: parent.childrenOrder.filter((id) => id !== pageId) },
        });
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
    const block: { id: string; properties: unknown; parentId: string | null; type: string } | null =
      await prisma.block.findUnique({
        where: { id: currentId },
        select: { id: true, properties: true, parentId: true, type: true },
      });
    if (!block || block.type !== 'page') break;
    const props = block.properties as Record<string, unknown>;
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
