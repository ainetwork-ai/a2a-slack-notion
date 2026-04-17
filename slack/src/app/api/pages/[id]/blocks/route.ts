/**
 * POST /api/pages/:id/blocks — append a new block to a page (or after a specific sibling).
 *
 * Body: { type, content?, properties?, parentId?, afterBlockId? }
 *   parentId: default = pageId (append as top-level child)
 *   afterBlockId: insert after this sibling in childrenOrder; default = append at end
 */

import { db } from '@/lib/db';
import { blocks, pagePermissions, workspaceMembers, type BlockType } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { onBlockCreated } from '@/lib/search/hooks';

const ALLOWED_BLOCK_TYPES: BlockType[] = [
  'page', 'text', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list', 'numbered_list',
  'to_do', 'toggle', 'callout', 'code', 'divider', 'image', 'quote', 'table', 'bookmark',
  'file', 'embed', 'database',
];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id: pageId } = await params;

  const [page] = await db.select().from(blocks).where(eq(blocks.id, pageId)).limit(1);
  if (!page || page.type !== 'page') {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Edit check
  const [perm] = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, auth.user.id)))
    .limit(1);
  const canEdit = perm
    ? perm.level === 'full_access' || perm.level === 'can_edit'
    : !!(await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, page.workspaceId), eq(workspaceMembers.userId, auth.user.id)))
        .limit(1)
        .then((r) => r[0]));
  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { type, content = {}, properties = {}, parentId: parentOverride, afterBlockId } = body;

  if (!ALLOWED_BLOCK_TYPES.includes(type)) {
    return NextResponse.json({ error: `Invalid block type: ${type}` }, { status: 400 });
  }

  const parentId = parentOverride ?? pageId;

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(blocks)
      .values({
        type,
        parentId,
        pageId,
        workspaceId: page.workspaceId,
        properties,
        content,
        childrenOrder: [],
        createdBy: auth.user.id,
      })
      .returning();

    // Insert into parent's childrenOrder at the right position
    const [parent] = await tx.select().from(blocks).where(eq(blocks.id, parentId)).limit(1);
    if (parent) {
      const cur = parent.childrenOrder ?? [];
      let next: string[];
      if (afterBlockId) {
        const idx = cur.indexOf(afterBlockId);
        next = idx >= 0 ? [...cur.slice(0, idx + 1), created.id, ...cur.slice(idx + 1)] : [...cur, created.id];
      } else {
        next = [...cur, created.id];
      }
      await tx.update(blocks).set({ childrenOrder: next }).where(eq(blocks.id, parent.id));
    }

    return created;
  });

  // Best-effort delta index (fire-and-forget)
  onBlockCreated({
    id: result.id,
    type: result.type,
    pageId: result.pageId,
    workspaceId: result.workspaceId,
    properties: result.properties,
    content: result.content,
    archived: result.archived,
    createdBy: result.createdBy,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  });

  return NextResponse.json(result, { status: 201 });
}
