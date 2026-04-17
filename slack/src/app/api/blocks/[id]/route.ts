/**
 * Block CRUD within a page.
 *
 * GET /api/blocks/:id — fetch a single block
 * PATCH /api/blocks/:id — update properties/content/childrenOrder
 * DELETE /api/blocks/:id — remove block + descendants (cascade via FK)
 */

import { db } from '@/lib/db';
import { blocks, pagePermissions, workspaceMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { onBlockUpdated, onBlockDeleted } from '@/lib/search/hooks';

async function canEdit(userId: string, block: typeof blocks.$inferSelect): Promise<boolean> {
  const [perm] = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, block.pageId), eq(pagePermissions.userId, userId)))
    .limit(1);
  if (perm) return perm.level === 'full_access' || perm.level === 'can_edit';

  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, block.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const [block] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 });

  // Read permission = workspace membership (no separate 'can_view' check needed for block-level yet)
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, block.workspaceId), eq(workspaceMembers.userId, auth.user.id)))
    .limit(1);
  if (!wm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(block);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const [block] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 });

  if (!(await canEdit(auth.user.id, block))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const updates: Partial<typeof blocks.$inferInsert> = { updatedAt: new Date() };
  if (body.properties !== undefined) updates.properties = body.properties;
  if (body.content !== undefined) updates.content = body.content;
  if (body.childrenOrder !== undefined) updates.childrenOrder = body.childrenOrder;
  if (body.archived !== undefined) updates.archived = body.archived;

  const [updated] = await db.update(blocks).set(updates).where(eq(blocks.id, id)).returning();

  // Best-effort reindex for global search
  if (updated) {
    onBlockUpdated({
      id: updated.id,
      type: updated.type,
      pageId: updated.pageId,
      workspaceId: updated.workspaceId,
      properties: updated.properties,
      content: updated.content,
      archived: updated.archived,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const [block] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 });

  if (!(await canEdit(auth.user.id, block))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.transaction(async (tx) => {
    // Remove block from its parent's childrenOrder
    if (block.parentId) {
      const [parent] = await tx.select().from(blocks).where(eq(blocks.id, block.parentId)).limit(1);
      if (parent) {
        const nextOrder = (parent.childrenOrder ?? []).filter((cid) => cid !== id);
        await tx.update(blocks).set({ childrenOrder: nextOrder }).where(eq(blocks.id, parent.id));
      }
    }
    await tx.delete(blocks).where(eq(blocks.id, id));
  });

  // Best-effort delete from global search (fire-and-forget)
  onBlockDeleted(id, block.type === 'page');

  return NextResponse.json({ success: true });
}
