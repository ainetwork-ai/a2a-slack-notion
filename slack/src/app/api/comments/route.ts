/**
 * GET  /api/comments?blockId= — comments on a block (threaded).
 *   Requires view access to the block's page.
 * POST /api/comments body { blockId, content, threadId? } — create comment.
 *   Requires comment access (permissionLevel in ['can_comment','can_edit','full_access']).
 */

import { db } from '@/lib/db';
import { blockComments, blocks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';
import { createNotionNotification } from '@/lib/notion/create-notification';

async function getBlockPage(blockId: string) {
  const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId)).limit(1);
  if (!block) return null;
  // The page block for this block is the pageId reference
  return getPage(block.pageId);
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const blockId = searchParams.get('blockId');
  if (!blockId) {
    return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
  }

  const page = await getBlockPage(blockId);
  if (!page) return NextResponse.json({ error: 'Block not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const comments = await db
    .select()
    .from(blockComments)
    .where(eq(blockComments.blockId, blockId));

  return NextResponse.json(comments);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json() as { blockId?: string; content?: unknown; threadId?: string };
  if (!body.blockId || body.content === undefined) {
    return NextResponse.json({ error: 'blockId and content are required' }, { status: 400 });
  }

  const page = await getBlockPage(body.blockId);
  if (!page) return NextResponse.json({ error: 'Block not found' }, { status: 404 });

  if (!(await canAccess(auth.user.id, page, 'comment'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [created] = await db
    .insert(blockComments)
    .values({
      blockId: body.blockId,
      authorId: auth.user.id,
      content: body.content,
      threadId: body.threadId ?? null,
    })
    .returning();

  // Notify the page creator when a comment is posted (if different from author).
  // Also fires for @mentions found in plain-text content representation.
  try {
    const pageTitle =
      (page.properties as Record<string, unknown> | null)?.['title'] as string | undefined
      ?? 'Untitled';

    const notifyUserIds = new Set<string>();

    // Notify page creator if different from commenter
    if (page.createdBy !== auth.user.id) {
      notifyUserIds.add(page.createdBy);
    }

    // Extract @mention user IDs from content if it is a rich-text structure
    // (array of inline nodes with type 'mention' and attrs.userId)
    if (Array.isArray(body.content)) {
      for (const node of body.content as Array<{ type?: string; attrs?: { userId?: string } }>) {
        if (node.type === 'mention' && node.attrs?.userId && node.attrs.userId !== auth.user.id) {
          notifyUserIds.add(node.attrs.userId);
        }
      }
    }

    await Promise.all(
      Array.from(notifyUserIds).map(userId =>
        createNotionNotification({
          userId,
          type: 'comment',
          title: `New comment on "${pageTitle}"`,
          body: typeof body.content === 'string' ? body.content.slice(0, 200) : undefined,
          pageId: page.id,
        }),
      ),
    );
  } catch {
    // Notification failures must never break comment creation
  }

  return NextResponse.json(created, { status: 201 });
}
