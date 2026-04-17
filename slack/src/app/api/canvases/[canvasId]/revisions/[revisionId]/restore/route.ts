/**
 * POST /api/canvases/:canvasId/revisions/:revisionId/restore
 *
 * Restores the canvas content to the given revision's content.
 * Saves the current content as a new revision before overwriting.
 */

import { db } from "@/lib/db";
import { canvases, canvasRevisions, channelMembers, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

async function canUserAccessCanvas(userId: string, canvas: typeof canvases.$inferSelect): Promise<boolean> {
  if (canvas.channelId) {
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, canvas.channelId), eq(channelMembers.userId, userId)))
      .limit(1);
    return !!membership;
  }
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, canvas.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ canvasId: string; revisionId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { canvasId, revisionId } = await params;

  const [canvas] = await db
    .select()
    .from(canvases)
    .where(eq(canvases.id, canvasId))
    .limit(1);

  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  const canAccess = await canUserAccessCanvas(user.id, canvas);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [revision] = await db
    .select()
    .from(canvasRevisions)
    .where(and(eq(canvasRevisions.id, revisionId), eq(canvasRevisions.canvasId, canvasId)))
    .limit(1);

  if (!revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  // Save current content as a new revision (rollback record)
  await db.insert(canvasRevisions).values({
    canvasId,
    content: canvas.content,
    editedBy: user.id,
  });

  // Restore the revision content
  const [updated] = await db
    .update(canvases)
    .set({ content: revision.content, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(canvases.id, canvasId))
    .returning();

  return NextResponse.json(updated);
}
