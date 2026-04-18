import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  blockComments,
  users,
  blocks,
} from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';
import { appEvents } from '@/lib/notion/events';
import '@/lib/notion/event-handlers';

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

export async function GET(request: NextRequest) {
  await getDefaultUser();

  const url = new URL(request.url);
  const blockId = url.searchParams.get('block_id');
  if (!blockId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'block_id required' },
      { status: 400 },
    );
  }

  const threads = await db
    .select()
    .from(blockComments)
    .where(and(eq(blockComments.blockId, blockId), isNull(blockComments.threadId)))
    .orderBy(desc(blockComments.createdAt));

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

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  // Look up block for pageId — needed for permission + event
  const block = await db
    .select({ pageId: blocks.pageId })
    .from(blocks)
    .where(eq(blocks.id, parsed.data.blockId))
    .limit(1)
    .then((r) => r[0]);

  if (block) {
    const ok = await checkPagePermission(user.id, block.pageId, 'can_comment');
    if (!ok) {
      return NextResponse.json(
        { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
        { status: 403 },
      );
    }
  }

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

  const [withAuthor] = await attachAuthor([comment]);

  if (block) {
    appEvents.emit('comment.created', {
      blockId: comment.blockId,
      authorId: comment.authorId,
      pageId: block.pageId,
    });
  }

  return NextResponse.json(
    { ...withAuthor, block: block ? { pageId: block.pageId } : null },
    { status: 201 },
  );
}
