/**
 * GET  /api/pages?workspaceId=&q=&limit=&cursor= — list/search pages in a workspace.
 * POST /api/pages — create a new page (root block of type='page').
 *
 * GET returns { pages: [], nextCursor?: string }
 * POST body: { workspaceId, title?, parentPageId?, icon?, properties? }
 */

import { db } from '@/lib/db';
import { blocks, workspaceMembers } from '@/lib/db/schema';
import { eq, and, lt, or, ilike, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

// ─── Cursor helpers ───────────────────────────────────────────────────────────

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}:${id}`).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) return null;
    const createdAt = new Date(raw.slice(0, colonIdx));
    const id = raw.slice(colonIdx + 1);
    if (isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ─── GET /api/pages ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');
  const q = searchParams.get('q')?.trim() ?? '';
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100);
  const cursorParam = searchParams.get('cursor');

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  // Workspace membership check
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, auth.user.id)))
    .limit(1);
  if (!wm) {
    return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });
  }

  // Build filter conditions
  const conditions: ReturnType<typeof eq>[] = [
    eq(blocks.type, 'page'),
    eq(blocks.workspaceId, workspaceId),
    eq(blocks.archived, false),
  ];

  if (q) {
    conditions.push(
      ilike(sql`${blocks.properties}->>'title'`, `%${q}%`) as ReturnType<typeof eq>
    );
  }

  if (cursorParam) {
    const decoded = decodeCursor(cursorParam);
    if (decoded) {
      conditions.push(
        or(
          lt(blocks.createdAt, decoded.createdAt),
          and(eq(blocks.createdAt, decoded.createdAt), lt(blocks.id, decoded.id))!
        ) as ReturnType<typeof eq>
      );
    }
  }

  const rows = await db
    .select()
    .from(blocks)
    .where(and(...conditions))
    .orderBy(sql`${blocks.createdAt} desc, ${blocks.id} desc`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pages = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && pages.length > 0
      ? encodeCursor(pages[pages.length - 1].createdAt, pages[pages.length - 1].id)
      : undefined;

  return NextResponse.json({ pages, ...(nextCursor ? { nextCursor } : {}) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const { workspaceId, title, parentPageId, icon, properties } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, auth.user.id)))
    .limit(1);
  if (!wm) {
    return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });
  }

  if (parentPageId) {
    const [parent] = await db.select().from(blocks).where(eq(blocks.id, parentPageId)).limit(1);
    if (!parent || parent.type !== 'page' || parent.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Invalid parent page' }, { status: 400 });
    }
  }

  const mergedProps = {
    title: title ?? 'Untitled',
    ...(icon !== undefined ? { icon } : {}),
    ...(properties ?? {}),
  };

  const page = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(blocks)
      .values({
        type: 'page',
        parentId: parentPageId ?? null,
        pageId: '00000000-0000-0000-0000-000000000000', // placeholder
        workspaceId,
        properties: mergedProps,
        content: {},
        childrenOrder: [],
        createdBy: auth.user.id,
      })
      .returning();

    // Self-reference page_id now that we have the id
    await tx.update(blocks).set({ pageId: created.id }).where(eq(blocks.id, created.id));

    if (parentPageId) {
      // Append to parent's children_order
      const [parent] = await tx.select().from(blocks).where(eq(blocks.id, parentPageId)).limit(1);
      const nextOrder = [...(parent!.childrenOrder ?? []), created.id];
      await tx.update(blocks).set({ childrenOrder: nextOrder }).where(eq(blocks.id, parentPageId));
    }

    return { ...created, pageId: created.id };
  });

  return NextResponse.json(page, { status: 201 });
}
