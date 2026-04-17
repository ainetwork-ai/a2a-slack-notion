import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requirePermission } from '../middleware/require-permission.js';
import { checkPagePermission } from '../lib/permissions.js';
import { appEvents } from '../lib/events.js';
import type { AppVariables } from '../types/app.js';
import type { Prisma } from '../generated/prisma/client.js';

const blocks = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

const ReorderSchema = z.object({
  blockId: z.string(),
  afterId: z.string().nullable(),
});

const CreateBlockSchema = z.object({
  type: z.string(),
  parentId: z.string().optional(),
  pageId: z.string(),
  workspaceId: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

const UpdateBlockSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

// GET / — list blocks filtered by pageId and/or parentId
blocks.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const pageId = c.req.query('pageId') ?? c.req.query('page_id');
  const parentId = c.req.query('parentId') ?? c.req.query('parent_id');

  if (!pageId && !parentId) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'pageId or parentId query param required' },
      400,
    );
  }

  if (pageId) {
    const hasPermission = await checkPagePermission(user.id, pageId, 'can_view');
    if (!hasPermission) {
      return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'No permission to view blocks on this page' }, 403);
    }
  }

  const where: Record<string, unknown> = { archived: false };
  if (pageId) where['pageId'] = pageId;
  if (parentId) where['parentId'] = parentId;

  const results = await prisma.block.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  // Exclude the page block itself from children results
  const filteredResults = pageId
    ? results.filter((b) => b.id !== pageId)
    : results;

  return c.json({ object: 'list', results: filteredResults });
});

// POST / — create a block
blocks.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const body = await c.req.json();
  const parsed = CreateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      400,
    );
  }

  const { type, parentId, pageId, workspaceId, properties, content } = parsed.data;

  const hasEditPermission = await checkPagePermission(user.id, pageId, 'can_edit');
  if (!hasEditPermission) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'No permission to create blocks on this page' }, 403);
  }

  // Validate block type against Prisma enum
  const validTypes = [
    'page', 'text', 'heading_1', 'heading_2', 'heading_3',
    'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'callout',
    'code', 'divider', 'image', 'quote', 'table', 'bookmark', 'file',
    'embed', 'database',
  ];
  if (!validTypes.includes(type)) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: `Invalid block type: ${type}` },
      400,
    );
  }

  const block = await prisma.block.create({
    data: {
      type: type as Parameters<typeof prisma.block.create>[0]['data']['type'],
      parentId: parentId ?? null,
      pageId,
      workspaceId,
      createdBy: user.id,
      properties: (properties ?? {}) as unknown as Prisma.InputJsonValue,
      content: (content ?? {}) as unknown as Prisma.InputJsonValue,
    },
  });

  // Add to parent's childrenOrder
  if (parentId) {
    const parent = await prisma.block.findUnique({
      where: { id: parentId },
      select: { childrenOrder: true },
    });
    if (parent) {
      await prisma.block.update({
        where: { id: parentId },
        data: { childrenOrder: [...parent.childrenOrder, block.id] },
      });
    }
  } else {
    // No parentId — append to the page block's childrenOrder
    const pageBlock = await prisma.block.findUnique({
      where: { id: pageId },
      select: { childrenOrder: true },
    });
    if (pageBlock) {
      await prisma.block.update({
        where: { id: pageId },
        data: { childrenOrder: [...pageBlock.childrenOrder, block.id] },
      });
    }
  }

  // Emit webhook event
  appEvents.emit('block.changed', { blockId: block.id, pageId: block.pageId, updatedBy: user.id });

  return c.json({ object: 'block', ...block }, 201);
});

// PATCH /:id — update block properties/content
blocks.patch('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      400,
    );
  }

  const existing = await prisma.block.findUnique({ where: { id } });
  if (!existing || existing.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Block not found' }, 404);
  }

  const canEdit = await checkPagePermission(user.id, existing.pageId, 'can_edit');
  if (!canEdit) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'No permission to edit blocks on this page' }, 403);
  }

  const updatedProperties = parsed.data.properties !== undefined
    ? { ...(existing.properties as Record<string, unknown>), ...parsed.data.properties }
    : existing.properties;

  const updatedContent = parsed.data.content !== undefined
    ? { ...(existing.content as Record<string, unknown>), ...parsed.data.content }
    : existing.content;

  const block = await prisma.block.update({
    where: { id },
    data: {
      properties: updatedProperties as unknown as Prisma.InputJsonValue,
      content: updatedContent as unknown as Prisma.InputJsonValue,
    },
  });

  // Emit webhook event
  appEvents.emit('block.changed', { blockId: block.id, pageId: block.pageId, updatedBy: user.id });

  return c.json({ object: 'block', ...block });
});

// DELETE /:id — soft delete (set archived=true)
blocks.delete('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const id = c.req.param('id');

  const existing = await prisma.block.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Block not found' }, 404);
  }

  const canDelete = await checkPagePermission(user.id, existing.pageId, 'can_edit');
  if (!canDelete) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'No permission to delete blocks on this page' }, 403);
  }

  await prisma.block.update({ where: { id }, data: { archived: true } });

  // Remove from parent's childrenOrder
  if (existing.parentId) {
    const parent = await prisma.block.findUnique({
      where: { id: existing.parentId },
      select: { childrenOrder: true },
    });
    if (parent) {
      await prisma.block.update({
        where: { id: existing.parentId },
        data: { childrenOrder: parent.childrenOrder.filter((cid) => cid !== id) },
      });
    }
  }

  return c.json({ object: 'block', id, archived: true });
});

// PATCH /:id/reorder — Atomically reorder a child block within its parent's childrenOrder
blocks.patch('/:id/reorder', requirePermission('can_edit'), async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id: parentId } = c.req.param();
  const body = await c.req.json();
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const { blockId, afterId } = parsed.data;

  type ReorderError = { ok: false; status: 400 | 404; code: string; message: string };
  type ReorderOk = { ok: true; childrenOrder: string[] };

  const result: ReorderError | ReorderOk = await prisma.$transaction(async (tx) => {
    const parent = await tx.block.findUnique({
      where: { id: parentId },
      select: { childrenOrder: true },
    });

    if (!parent) {
      return { ok: false, status: 404, code: 'not_found', message: 'Parent block not found' } satisfies ReorderError;
    }

    const order = [...parent.childrenOrder];

    if (!order.includes(blockId)) {
      return { ok: false, status: 400, code: 'validation_error', message: 'blockId is not in childrenOrder' } satisfies ReorderError;
    }

    // Remove blockId from current position
    const filtered = order.filter((id) => id !== blockId);

    let newOrder: string[];
    if (afterId === null) {
      // Insert at the beginning
      newOrder = [blockId, ...filtered];
    } else {
      const afterIndex = filtered.indexOf(afterId);
      if (afterIndex === -1) {
        // afterId not found — append at end
        newOrder = [...filtered, blockId];
      } else {
        // Insert immediately after afterId
        newOrder = [
          ...filtered.slice(0, afterIndex + 1),
          blockId,
          ...filtered.slice(afterIndex + 1),
        ];
      }
    }

    await tx.block.update({
      where: { id: parentId },
      data: { childrenOrder: newOrder },
    });

    return { ok: true, childrenOrder: newOrder } satisfies ReorderOk;
  });

  if (!result.ok) {
    return c.json({ object: 'error', status: result.status, code: result.code, message: result.message }, result.status);
  }

  return c.json({ object: 'block', id: parentId, childrenOrder: result.childrenOrder });
});

export { blocks };
