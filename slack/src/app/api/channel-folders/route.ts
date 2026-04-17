import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { channelFolders } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { resolveWorkspaceIdQuery, resolveWorkspaceParam } from "@/lib/resolve";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const workspaceId = await resolveWorkspaceIdQuery(request);
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const folders = await db
    .select()
    .from(channelFolders)
    .where(
      and(
        eq(channelFolders.userId, user.id),
        eq(channelFolders.workspaceId, workspaceId)
      )
    )
    .orderBy(asc(channelFolders.position), asc(channelFolders.createdAt));

  return NextResponse.json(folders);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { name, workspaceId: workspaceRef } = body as { name?: string; workspaceId?: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }
  if (!workspaceRef) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  const ws = await resolveWorkspaceParam(String(workspaceRef));
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Get current max position for this user/workspace
  const existing = await db
    .select({ position: channelFolders.position })
    .from(channelFolders)
    .where(
      and(
        eq(channelFolders.userId, user.id),
        eq(channelFolders.workspaceId, workspaceId)
      )
    )
    .orderBy(asc(channelFolders.position));

  const nextPosition = existing.length > 0
    ? Math.max(...existing.map((f) => f.position)) + 1
    : 0;

  const [folder] = await db
    .insert(channelFolders)
    .values({
      userId: user.id,
      workspaceId,
      name: name.trim(),
      position: nextPosition,
    })
    .returning();

  return NextResponse.json(folder, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { id, name, position } = body as { id?: string; name?: string; position?: number };

  if (!id) {
    return NextResponse.json({ error: "Folder id is required" }, { status: 400 });
  }

  // Verify ownership
  const [folder] = await db
    .select()
    .from(channelFolders)
    .where(and(eq(channelFolders.id, id), eq(channelFolders.userId, user.id)))
    .limit(1);

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const updates: Partial<{ name: string; position: number }> = {};
  if (name !== undefined) updates.name = name.trim();
  if (position !== undefined) updates.position = position;

  const [updated] = await db
    .update(channelFolders)
    .set(updates)
    .where(eq(channelFolders.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: "Folder id is required" }, { status: 400 });
  }

  // Verify ownership
  const [folder] = await db
    .select()
    .from(channelFolders)
    .where(and(eq(channelFolders.id, id), eq(channelFolders.userId, user.id)))
    .limit(1);

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  await db.delete(channelFolders).where(eq(channelFolders.id, id));

  return NextResponse.json({ ok: true });
}
