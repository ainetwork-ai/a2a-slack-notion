import { db } from "@/lib/db";
import { users, dmMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { resolveDmParam } from "@/lib/resolve";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { conversationId: param } = await params;
  const conv = await resolveDmParam(param, user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = await request.json();

  if (body.action === "markRead") {
    await db
      .update(dmMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(dmMembers.conversationId, conv.id), eq(dmMembers.userId, user.id)));

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

  const { conversationId: param } = await params;
  const conv = await resolveDmParam(param, user.id);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const [membership] = await db
    .select({ lastReadAt: dmMembers.lastReadAt, isMuted: dmMembers.isMuted })
    .from(dmMembers)
    .where(and(eq(dmMembers.conversationId, conv.id), eq(dmMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const members = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isAgent: users.isAgent,
      status: users.status,
      ainAddress: users.ainAddress,
      a2aId: users.a2aId,
    })
    .from(dmMembers)
    .innerJoin(users, eq(dmMembers.userId, users.id))
    .where(eq(dmMembers.conversationId, conv.id));

  const otherMembers = members.filter((m) => m.id !== user.id);
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
