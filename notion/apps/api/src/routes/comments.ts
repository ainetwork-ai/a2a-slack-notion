import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  blockComments,
  users,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import { requirePermission } from '../middleware/require-permission.js';
import { appEvents } from '../lib/events.js';
import type { AppVariables } from '../types/app.js';

const comments = new Hono<{ Variables: AppVariables }>();

const CreateCommentSchema = z.object({
  blockId: z.string(),
  content: z.object({
    text: z.string(),
    selectedText: z.string().optional(),
    commentMarkId: z.string().optional(),
  }),
  threadId: z.string().optional(),
});

type Author = { id: string; name: string; image: string | null };

async function attachAuthor<T extends { authorId: string }>(
  rows: T[],
): Promise<(T & { author: Author | null })[]> {
  if (rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
  const authors = (await db
    .select({ id: users.id, name: users.displayName, image: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, authorIds))) as Author[];
  const authorMap = new Map<string, Author>(authors.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, author: authorMap.get(r.authorId) ?? null }));
}

// List comments for a block
comments.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const blockId = c.req.query('block_id');
  if (!blockId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'block_id required' }, 400);

  // Top-level threads: threadId IS NULL
  const threads = await db
    .select()
    .from(blockComments)
    .where(and(eq(blockComments.blockId, blockId), isNull(blockComments.threadId)))
    .orderBy(desc(blockComments.createdAt));

  // Replies for each thread
  const threadIds = threads.map((t) => t.id);
  const replies =
    threadIds.length > 0
      ? await db
          .select()
          .from(blockComments)
          .where(inArray(blockComments.threadId, threadIds))
          .orderBy(asc(blockComments.createdAt))
      : [];

  const threadsWithAuthor = await attachAuthor(threads);
  const repliesWithAuthor = await attachAuthor(replies);

  const repliesByThread = new Map<string, typeof repliesWithAuthor>();
  for (const r of repliesWithAuthor) {
    if (!r.threadId) continue;
    const list = repliesByThread.get(r.threadId) ?? [];
    list.push(r);
    repliesByThread.set(r.threadId, list);
  }

  const result = threadsWithAuthor.map((t) => ({
    ...t,
    replies: repliesByThread.get(t.id) ?? [],
  }));

  return c.json(result);
});

// Create comment
comments.post('/', requirePermission('can_comment'), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const comment = await db
    .insert(blockComments)
    .values({
      blockId: parsed.data.blockId,
      authorId: user.id,
      content: parsed.data.content as Record<string, string>,
      threadId: parsed.data.threadId ?? null,
    })
    .returning()
    .then((r) => r[0]!);

  // Fetch block for pageId (for event emission)
  const block = await db
    .select({ pageId: blocks.pageId })
    .from(blocks)
    .where(eq(blocks.id, comment.blockId))
    .limit(1)
    .then((r) => r[0]);

  const [withAuthor] = await attachAuthor([comment]);

  if (block) {
    appEvents.emit('comment.created', {
      blockId: comment.blockId,
      authorId: comment.authorId,
      pageId: block.pageId,
    });
  }

  return c.json({ ...withAuthor, block: block ? { pageId: block.pageId } : null }, 201);
});

// Resolve/unresolve a comment thread
comments.patch('/:commentId/resolve', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { commentId } = c.req.param();
  const existing = await db
    .select()
    .from(blockComments)
    .where(eq(blockComments.id, commentId))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Comment not found' }, 404);

  const comment = await db
    .update(blockComments)
    .set({ resolved: !existing.resolved, updatedAt: new Date() })
    .where(eq(blockComments.id, commentId))
    .returning()
    .then((r) => r[0]);

  return c.json(comment);
});

// Delete comment
comments.delete('/:commentId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { commentId } = c.req.param();
  const existing = await db
    .select({ authorId: blockComments.authorId })
    .from(blockComments)
    .where(eq(blockComments.id, commentId))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Comment not found' }, 404);
  if (existing.authorId !== user.id) return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Not authorized to delete this comment' }, 403);

  await db.delete(blockComments).where(eq(blockComments.id, commentId));
  return c.json({ object: 'comment', id: commentId, deleted: true });
});

export { comments };
