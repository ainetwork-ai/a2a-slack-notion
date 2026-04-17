import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { workspaceMembers, users, channels } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { resolveWorkspaceParam } from "@/lib/resolve";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workspaceId: param } = await params;
  const ws = await resolveWorkspaceParam(param);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Verify caller is a member
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, auth.user.id)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      ainAddress: users.ainAddress,
      isAgent: users.isAgent,
      status: users.status,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.joinedAt);

  // Channel count for this workspace
  const [{ channelCount }] = await db
    .select({ channelCount: sql<number>`count(*)::int` })
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId));

  return NextResponse.json({ members, channelCount });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workspaceId: param } = await params;
  const ws = await resolveWorkspaceParam(param);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Check caller's role
  const [callerMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, auth.user.id)
      )
    )
    .limit(1);

  if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Cannot remove an owner
  const [targetMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (targetMembership.role === "owner") {
    return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 400 });
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    );

  await logAudit(workspaceId, auth.user.id, "member.remove", "user", userId);

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workspaceId: param } = await params;
  const ws = await resolveWorkspaceParam(param);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Only owner can change roles
  const [callerMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, auth.user.id)
      )
    )
    .limit(1);

  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can change roles" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, role } = body as { userId?: string; role?: string };

  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
  }

  if (!["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "Role must be 'admin' or 'member'" }, { status: 400 });
  }

  // Cannot change role of the owner
  const [targetMembership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (targetMembership.role === "owner") {
    return NextResponse.json({ error: "Cannot change role of workspace owner" }, { status: 400 });
  }

  await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    );

  await logAudit(workspaceId, auth.user.id, "member.role_change", "user", userId, { newRole: role, previousRole: targetMembership.role });

  return NextResponse.json({ success: true });
}
