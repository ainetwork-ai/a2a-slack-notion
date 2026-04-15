import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requirePermission } from '../middleware/require-permission.js';
import { appEvents } from '../lib/events.js';
import type { AppVariables } from '../types/app.js';

const comments = new Hono<{ Variables: AppVariables }>();

const CreateCommentSchema = z.object({
  blockId: z.string(),
  content: z.object({ text: z.string() }),
  threadId: z.string().optional(),
});

// List comments for a block
comments.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const blockId = c.req.query('block_id');
  if (!blockId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'block_id required' }, 400);

  const result = await prisma.comment.findMany({
    where: { blockId, threadId: null },
    include: {
      author: { select: { id: true, name: true, image: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(result);
});

// Create comment
comments.post('/', requirePermission('can_comment'), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const comment = await prisma.comment.create({
    data: {
      blockId: parsed.data.blockId,
      authorId: user.id,
      content: parsed.data.content as Record<string, string>,
      threadId: parsed.data.threadId,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      block: { select: { pageId: true } },
    },
  });

  // Emit event so notification handler can notify the page owner
  appEvents.emit('comment.created', {
    blockId: comment.blockId,
    authorId: comment.authorId,
    pageId: comment.block.pageId,
  });

  return c.json(comment, 201);
});

// Resolve/unresolve a comment thread
comments.patch('/:commentId/resolve', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { commentId } = c.req.param();
  const existing = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Comment not found' }, 404);

  const comment = await prisma.comment.update({
    where: { id: commentId },
    data: { resolved: !existing.resolved },
  });

  return c.json(comment);
});

// Delete comment
comments.delete('/:commentId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { commentId } = c.req.param();
  const existing = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true } });
  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Comment not found' }, 404);
  if (existing.authorId !== user.id) return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not authorized to delete this comment' }, 403);

  await prisma.comment.delete({ where: { id: commentId } });
  return c.json({ object: 'comment', id: commentId, deleted: true });
});

export { comments };
