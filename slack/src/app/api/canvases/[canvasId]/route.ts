import { db } from "@/lib/db";
import { canvases, canvasRevisions, channels, channelMembers, workspaceMembers, users } from "@/lib/db/schema";
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
  // For workspace-level or DM canvases, check workspace membership
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

  // Enrich with updatedBy user info
  let updatedByUser = null;
  if (canvas.updatedBy) {
    const [u] = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, canvas.updatedBy))
      .limit(1);
    updatedByUser = u ?? null;
  }

  return NextResponse.json({ ...canvas, updatedByUser });
}

export async function PATCH(
  request: NextRequest,
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

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.content !== undefined) updates.content = body.content;

  // Save revision before updating
  if (body.content !== undefined && body.content !== canvas.content) {
    await db.insert(canvasRevisions).values({
      canvasId,
      content: canvas.content,
      editedBy: user.id,
    });
  }

  const [updated] = await db
    .update(canvases)
    .set(updates)
    .where(eq(canvases.id, canvasId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
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

  await db.delete(canvases).where(eq(canvases.id, canvasId));
  return NextResponse.json({ success: true });
}
