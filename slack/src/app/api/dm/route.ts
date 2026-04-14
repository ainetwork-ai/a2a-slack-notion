import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  // Get all conversation IDs for this user
  const userConversations = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, user.id));

  if (userConversations.length === 0) {
    return NextResponse.json([]);
  }

  const conversationIds = userConversations.map((c) => c.conversationId);

  const conversations = await db
    .select()
    .from(dmConversations)
    .where(inArray(dmConversations.id, conversationIds))
    .orderBy(desc(dmConversations.updatedAt));

  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const members = await db
        .select({
          userId: dmMembers.userId,
          lastReadAt: dmMembers.lastReadAt,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
          isAgent: users.isAgent,
        })
        .from(dmMembers)
        .innerJoin(users, eq(dmMembers.userId, users.id))
        .where(eq(dmMembers.conversationId, conv.id));

      const [latestMessage] = await db
        .select({
          id: messages.id,
          content: messages.content,
          createdAt: messages.createdAt,
          userId: messages.userId,
        })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return { ...conv, members, latestMessage: latestMessage || null };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { userIds } = body as { userIds: string[] };

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds array is required" }, { status: 400 });
  }

  // Always include the current user
  const allUserIds = Array.from(new Set([user.id, ...userIds])).sort();

  // Find existing conversation with exact same members
  // Get all conversations where current user is a member
  const userConvIds = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, user.id));

  for (const { conversationId } of userConvIds) {
    const members = await db
      .select({ userId: dmMembers.userId })
      .from(dmMembers)
      .where(eq(dmMembers.conversationId, conversationId));

    const memberIds = members.map((m) => m.userId).sort();
    if (
      memberIds.length === allUserIds.length &&
      memberIds.every((id, i) => id === allUserIds[i])
    ) {
      // Found existing conversation
      const [conv] = await db
        .select()
        .from(dmConversations)
        .where(eq(dmConversations.id, conversationId))
        .limit(1);
      return NextResponse.json({ ...conv, existing: true });
    }
  }

  // Create new conversation
  const [conversation] = await db.insert(dmConversations).values({}).returning();

  await db.insert(dmMembers).values(
    allUserIds.map((uid) => ({ conversationId: conversation.id, userId: uid }))
  );

  return NextResponse.json({ ...conversation, existing: false }, { status: 201 });
}
