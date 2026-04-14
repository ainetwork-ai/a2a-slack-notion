import { db } from "@/lib/db";
import { users, channels, messages, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, inArray, or, isNotNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  // Find messages where:
  // 1. parentId is not null AND userId = current user (user replied in a thread)
  // 2. id is in (select parentId from messages where userId = current user) (user started a thread)
  const userReplies = await db
    .select({ parentId: messages.parentId })
    .from(messages)
    .where(and(isNotNull(messages.parentId), eq(messages.userId, user.id)));

  const parentIds = userReplies
    .map((r) => r.parentId)
    .filter((id): id is string => id !== null);

  const conditions = [
    and(isNotNull(messages.parentId), eq(messages.userId, user.id)),
  ];

  if (parentIds.length > 0) {
    conditions.push(inArray(messages.id, parentIds) as typeof conditions[0]);
  }

  const results = await db
    .select({
      id: messages.id,
      content: messages.content,
      contentType: messages.contentType,
      createdAt: messages.createdAt,
      parentId: messages.parentId,
      channelId: messages.channelId,
      conversationId: messages.conversationId,
      userId: messages.userId,
      user: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(or(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  // Enrich with channel name
  const enriched = await Promise.all(
    results.map(async (msg) => {
      let channelName: string | null = null;
      let conversationName: string | null = null;

      if (msg.channelId) {
        const [ch] = await db
          .select({ name: channels.name })
          .from(channels)
          .where(eq(channels.id, msg.channelId))
          .limit(1);
        channelName = ch?.name ?? null;
      }

      if (msg.conversationId) {
        const members = await db
          .select({ displayName: users.displayName })
          .from(dmMembers)
          .innerJoin(users, eq(dmMembers.userId, users.id))
          .where(
            and(
              eq(dmMembers.conversationId, msg.conversationId),
            )
          );
        conversationName = members.map((m) => m.displayName).join(', ');
      }

      return { ...msg, channelName, conversationName };
    })
  );

  return NextResponse.json({ threads: enriched });
}
