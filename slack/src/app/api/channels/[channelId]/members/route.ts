import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, workflows, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/workflow/executor";
import { resolveChannelParam } from "@/lib/resolve";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const { channelId: param } = await params;
    const channel = await resolveChannelParam(param, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = channel.id;

    if (channel.workspaceId) {
      const [wm] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, channel.workspaceId), eq(workspaceMembers.userId, user.id)))
        .limit(1);
      if (!wm) {
        return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
      }
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
  } catch (err) {
    console.error("[members GET]", err);
    return NextResponse.json(
      { error: "Failed to load members", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const { channelId: param } = await params;
    const resolvedChannel = await resolveChannelParam(param, user.id);
    if (!resolvedChannel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = resolvedChannel.id;

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
      if (resolvedChannel.isPrivate) {
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

    // Insert system message: "X joined #channel"
    await db.insert(messages).values({
      channelId,
      userId: targetUser.id,
      content: `${targetUser.displayName} joined #${resolvedChannel.name ?? channelId}`,
      contentType: "system",
    });

    // Trigger channel_join workflows
    if (resolvedChannel.workspaceId) {
      const matchingWorkflows = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.workspaceId, resolvedChannel.workspaceId),
            eq(workflows.triggerType, "channel_join"),
            eq(workflows.enabled, true)
          )
        );

      for (const wf of matchingWorkflows) {
        const config = wf.triggerConfig as { channelId?: string } | null;
        if (config?.channelId && config.channelId !== channelId) continue;
        runWorkflow(wf.id, {
          trigger: { userId, channelId },
        }).catch(() => {
          // Fire-and-forget
        });
      }
    }

    return NextResponse.json(newMember, { status: 201 });
  } catch (err) {
    console.error("[members POST]", err);
    return NextResponse.json(
      { error: "Failed to add member", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const { channelId: param } = await params;
    const channel = await resolveChannelParam(param, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = channel.id;

    const body = await request.json();

    if (body.action === "markRead") {
      await db
        .update(channelMembers)
        .set({ lastReadAt: new Date() })
        .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));

      return NextResponse.json({ success: true });
    }

    if (body.action === "setEngagementLevel") {
      const { targetUserId, engagementLevel } = body;

      if (typeof engagementLevel !== "number" || engagementLevel < 0 || engagementLevel > 3) {
        return NextResponse.json({ error: "engagementLevel must be 0-3" }, { status: 400 });
      }

      if (!targetUserId || typeof targetUserId !== "string") {
        return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
      }

      // Only admins/owners can change engagement level
      const [membership] = await db
        .select()
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
        .limit(1);

      if (!membership || !["owner", "admin"].includes(membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }

      await db
        .update(channelMembers)
        .set({ engagementLevel })
        .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, targetUserId)));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[members PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update member", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const { channelId: param } = await params;
    const resolvedChannel = await resolveChannelParam(param, user.id);
    if (!resolvedChannel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = resolvedChannel.id;

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

    // Fetch user info for system message before deleting
    const [leavingUser] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    await db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, targetUserId)));

    // Insert system message: "X left #channel"
    if (leavingUser) {
      await db.insert(messages).values({
        channelId,
        userId: targetUserId,
        content: `${leavingUser.displayName} left #${resolvedChannel.name}`,
        contentType: "system",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[members DELETE]", err);
    return NextResponse.json(
      { error: "Failed to remove member", detail: String(err) },
      { status: 500 }
    );
  }
}
