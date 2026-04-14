import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const channelIdFilter = searchParams.get("channelId");

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${q.trim()}%`;

  // Search messages in channels the user is a member of
  const userChannelIds = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, user.id));

  const channelIds = userChannelIds.map((c) => c.channelId);

  // If channelId filter provided, scope to that channel only (if user is a member)
  if (channelIdFilter) {
    if (!channelIds.includes(channelIdFilter)) {
      return NextResponse.json({ results: [] });
    }
    const conditions = [
      ilike(messages.content, pattern),
      eq(messages.channelId, channelIdFilter),
    ];
    const results = await db
      .select({
        id: messages.id,
        content: messages.content,
        contentType: messages.contentType,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        channelId: messages.channelId,
        conversationId: messages.conversationId,
        parentId: messages.parentId,
        userId: messages.userId,
        user: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(50);
    const enriched = results.map(msg => ({
      ...msg,
      senderName: msg.user?.displayName ?? null,
      channel: { id: channelIdFilter, name: '' },
      conversation: null,
    }));
    return NextResponse.json({ results: enriched });
  }

  // Search messages in channels user belongs to + DMs user belongs to
  const userConvIds = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, user.id));

  const conversationIds = userConvIds.map((c) => c.conversationId);

  const conditions = [ilike(messages.content, pattern)];
  const locationConditions = [];
  if (channelIds.length > 0) {
    locationConditions.push(inArray(messages.channelId, channelIds));
  }
  if (conversationIds.length > 0) {
    locationConditions.push(inArray(messages.conversationId, conversationIds));
  }

  if (locationConditions.length === 0) {
    return NextResponse.json({ results: [] });
  }

  conditions.push(or(...locationConditions)!);

  const results = await db
    .select({
      id: messages.id,
      content: messages.content,
      contentType: messages.contentType,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      channelId: messages.channelId,
      conversationId: messages.conversationId,
      parentId: messages.parentId,
      userId: messages.userId,
      user: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  // Enrich with channel/conversation info
  const enriched = await Promise.all(
    results.map(async (msg) => {
      let channelInfo = null;
      let conversationInfo = null;

      if (msg.channelId) {
        const [ch] = await db
          .select({ id: channels.id, name: channels.name })
          .from(channels)
          .where(eq(channels.id, msg.channelId))
          .limit(1);
        channelInfo = ch || null;
      }

      if (msg.conversationId) {
        const members = await db
          .select({
            userId: dmMembers.userId,
            displayName: users.displayName,
          })
          .from(dmMembers)
          .innerJoin(users, eq(dmMembers.userId, users.id))
          .where(eq(dmMembers.conversationId, msg.conversationId));
        conversationInfo = { id: msg.conversationId, members };
      }

      return { ...msg, channel: channelInfo, conversation: conversationInfo };
    })
  );

  return NextResponse.json({ results: enriched });
}
