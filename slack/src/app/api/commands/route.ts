import { db } from "@/lib/db";
import { customCommands, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceIdQuery, resolveWorkspaceParam } from "@/lib/resolve";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const workspaceId = await resolveWorkspaceIdQuery(request);
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const cmds = await db
    .select()
    .from(customCommands)
    .where(eq(customCommands.workspaceId, workspaceId))
    .orderBy(customCommands.createdAt);

  return NextResponse.json(cmds);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { workspaceId: workspaceRef, name, description, responseText } = body;

  if (!workspaceRef || !name || !responseText) {
    return NextResponse.json(
      { error: "workspaceId, name, and responseText are required" },
      { status: 400 }
    );
  }

  const ws = await resolveWorkspaceParam(String(workspaceRef));
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Ensure caller is admin/owner of the workspace
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id)
      )
    );

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Normalise: strip leading slash, lowercase
  const normalizedName = name.replace(/^\/+/, "").toLowerCase().trim();
  if (!normalizedName) {
    return NextResponse.json({ error: "Invalid command name" }, { status: 400 });
  }

  const [cmd] = await db
    .insert(customCommands)
    .values({
      workspaceId,
      name: normalizedName,
      description: description?.trim() ?? "",
      responseText: responseText.trim(),
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json(cmd, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { id, workspaceId: workspaceRef } = body;

  if (!id || !workspaceRef) {
    return NextResponse.json({ error: "id and workspaceId are required" }, { status: 400 });
  }

  const ws = await resolveWorkspaceParam(String(workspaceRef));
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Ensure caller is admin/owner
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id)
      )
    );

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(customCommands)
    .where(
      and(eq(customCommands.id, id), eq(customCommands.workspaceId, workspaceId))
    );

  return NextResponse.json({ ok: true });
}
