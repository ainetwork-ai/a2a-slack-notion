import { db } from "@/lib/db";
import { canvases, canvasRevisions, channelMembers, workspaceMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

/**
 * Returns {access:false} if the user cannot see the canvas at all, otherwise
 * returns the user's role scoped to the canvas:
 *  - channel canvases → channel role (owner|admin|member|guest|...)
 *  - workspace/DM canvases → workspace role (fallback)
 */
async function getCanvasRole(
  userId: string,
  canvas: typeof canvases.$inferSelect
): Promise<{ access: true; role: string; scope: "channel" | "workspace" } | { access: false }> {
  if (canvas.channelId) {
    const [membership] = await db
      .select({ role: channelMembers.role })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, canvas.channelId), eq(channelMembers.userId, userId)))
      .limit(1);
    if (!membership) return { access: false };
    return { access: true, role: membership.role, scope: "channel" };
  }
  const [wm] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, canvas.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!wm) return { access: false };
  return { access: true, role: wm.role, scope: "workspace" };
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

  const role = await getCanvasRole(user.id, canvas);
  if (!role.access) {
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

  const role = await getCanvasRole(user.id, canvas);
  if (!role.access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Subtask #8: guests are read-only for channel canvases
  if (role.scope === "channel" && role.role === "guest") {
    return NextResponse.json({ error: "Guests cannot edit canvases" }, { status: 403 });
  }

  const body = await request.json();

  // Subtask #6: concurrent-edit detection.
  // Client sends either an `If-Unmodified-Since` header or a body field
  // `baseUpdatedAt` (ISO string). If the canvas has been modified after that
  // timestamp, return 409 + current state. `overwrite: true` skips the check.
  if (!body.overwrite) {
    const headerTs = request.headers.get("if-unmodified-since");
    const baseTs = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : headerTs;
    if (baseTs) {
      const baseMs = new Date(baseTs).getTime();
      const currentMs = canvas.updatedAt ? new Date(canvas.updatedAt).getTime() : 0;
      // A 1-second grace window avoids false 409s when the client round-trips
      // the server's ISO timestamp (millisecond truncation on some drivers).
      if (!isNaN(baseMs) && currentMs - baseMs > 1000) {
        // Enrich with updatedBy like GET for the conflict UI
        let updatedByUser = null;
        if (canvas.updatedBy) {
          const [u] = await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(eq(users.id, canvas.updatedBy))
            .limit(1);
          updatedByUser = u ?? null;
        }
        return NextResponse.json(
          { error: "conflict", latest: { ...canvas, updatedByUser } },
          { status: 409 }
        );
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };
  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    // Preserve previous title rather than saving an empty string — prevents accidental blank titles
    if (trimmed.length > 0) updates.title = trimmed;
  }
  if (body.content !== undefined) updates.content = body.content;
  if (body.topic !== undefined) updates.topic = body.topic?.trim() || null;

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

  const role = await getCanvasRole(user.id, canvas);
  if (!role.access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Subtask #8: guests cannot delete
  if (role.scope === "channel" && role.role === "guest") {
    return NextResponse.json({ error: "Guests cannot delete canvases" }, { status: 403 });
  }

  await db.delete(canvases).where(eq(canvases.id, canvasId));
  return NextResponse.json({ success: true });
}
