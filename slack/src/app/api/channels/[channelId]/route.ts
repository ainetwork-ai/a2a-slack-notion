import { db } from "@/lib/db";
import { users, channels, channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { resolveChannelParam } from "@/lib/resolve";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const channel = await resolveChannelParam(param, user.id);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  const channelId = channel.id;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const members = await db
    .select({
      id: channelMembers.userId,
      role: channelMembers.role,
      joinedAt: channelMembers.joinedAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      isAgent: users.isAgent,
    })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(eq(channelMembers.channelId, channelId));

  return NextResponse.json({ ...channel, members });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const channel = await resolveChannelParam(param, user.id);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  const channelId = channel.id;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description;
  if (body.isArchived !== undefined) updates.isArchived = Boolean(body.isArchived);

  const [updated] = await db
    .update(channels)
    .set(updates)
    .where(eq(channels.id, channelId))
    .returning();

  if (updated.workspaceId) {
    const action = body.isArchived ? "channel.archive" : "channel.update";
    await logAudit(updated.workspaceId, user.id, action, "channel", channelId, { name: updated.name });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const channel = await resolveChannelParam(param, user.id);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  const channelId = channel.id;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Only owner can delete channel" }, { status: 403 });
  }

  await db.delete(channels).where(eq(channels.id, channelId));

  if (channel.workspaceId) {
    await logAudit(channel.workspaceId, user.id, "channel.delete", "channel", channelId, { name: channel.name });
  }

  return NextResponse.json({ success: true });
}
