import { db } from "@/lib/db";
import { users, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { conversationId } = await params;
  const body = await request.json();

  if (body.action === "markRead") {
    await db
      .update(dmMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)));

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { conversationId } = await params;

  // Verify membership and get mute state
  const [membership] = await db
    .select({ lastReadAt: dmMembers.lastReadAt, isMuted: dmMembers.isMuted })
    .from(dmMembers)
    .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const [conv] = await db
    .select()
    .from(dmConversations)
    .where(eq(dmConversations.id, conversationId))
    .limit(1);

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Get all members
  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isAgent: users.isAgent,
    })
    .from(dmMembers)
    .innerJoin(users, eq(dmMembers.userId, users.id))
    .where(eq(dmMembers.conversationId, conversationId));

  const otherMembers = members.filter((m) => m.id !== user.id);
  // For 1-on-1 DMs keep otherUser for compat; for group DMs it's null
  const otherUser = otherMembers.length === 1 ? otherMembers[0] : null;
  const isGroup = members.length > 2;

  return NextResponse.json({
    conversation: {
      id: conv.id,
      otherUser,
      members,
      otherMembers,
      isGroup,
      agentSkills: [],
      isMuted: membership.isMuted,
    },
  });
}
