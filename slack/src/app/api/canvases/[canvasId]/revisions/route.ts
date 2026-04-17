/**
 * GET /api/canvases/:canvasId/revisions
 *
 * Returns the revision history for a canvas.
 * Each item: { id, editedByName, editedAt, contentPreview }
 * contentPreview is the first 500 chars of the revision content.
 */

import { db } from "@/lib/db";
import { canvases, canvasRevisions, channelMembers, workspaceMembers, users } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { canvasId } = await params;

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

  const rows = await db
    .select({
      id: canvasRevisions.id,
      editedAt: canvasRevisions.editedAt,
      content: canvasRevisions.content,
      editedByName: users.displayName,
    })
    .from(canvasRevisions)
    .leftJoin(users, eq(canvasRevisions.editedBy, users.id))
    .where(eq(canvasRevisions.canvasId, canvasId))
    .orderBy(desc(canvasRevisions.editedAt));

  const revisions = rows.map(r => ({
    id: r.id,
    editedByName: r.editedByName ?? "Unknown",
    editedAt: r.editedAt,
    contentPreview: r.content.slice(0, 500),
  }));

  return NextResponse.json(revisions);
}
