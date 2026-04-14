import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const q = new URL(_request.url).searchParams.get("q");

  const conditions = [eq(channelMembers.channelId, channelId)];

  const members = await db
    .select({
      id: channelMembers.userId,
      userId: channelMembers.userId,
      role: channelMembers.role,
      joinedAt: channelMembers.joinedAt,
      lastReadAt: channelMembers.lastReadAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      isAgent: users.isAgent,
      a2aUrl: users.a2aUrl,
    })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(and(...conditions));

  const filtered = q
    ? members.filter(m => m.displayName.toLowerCase().includes(q.toLowerCase()))
    : members;

  return NextResponse.json(filtered);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  const body = await request.json();
  const userId = body.userId || user.id;
  const isSelfJoin = userId === user.id;

  if (!isSelfJoin) {
    // Only admins/owners can add other users
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  } else {
    // Self-join: only allowed on public channels
    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (channel.isPrivate) {
      return NextResponse.json({ error: "Cannot self-join private channel" }, { status: 403 });
    }
  }

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "User already a member" }, { status: 409 });
  }

  const [newMember] = await db
    .insert(channelMembers)
    .values({ channelId, userId, role: "member" })
    .returning();

  return NextResponse.json(newMember, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;
  const body = await request.json();

  if (body.action === "markRead") {
    await db
      .update(channelMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  // Parse body (may be empty when leaving channel as self)
  let targetUserId = user.id;
  try {
    const body = await request.json();
    if (body.userId) targetUserId = body.userId;
  } catch {
    // no body — default to self
  }

  const isSelfLeave = targetUserId === user.id;

  if (!isSelfLeave) {
    // Removing another user requires admin/owner
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  }

  const [targetMembership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, targetUserId)))
    .limit(1);

  if (!targetMembership) {
    return NextResponse.json({ error: "User is not a member" }, { status: 404 });
  }

  if (targetMembership.role === "owner" && !isSelfLeave) {
    return NextResponse.json({ error: "Cannot remove the channel owner" }, { status: 400 });
  }

  await db
    .delete(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, targetUserId)));

  return NextResponse.json({ success: true });
}
