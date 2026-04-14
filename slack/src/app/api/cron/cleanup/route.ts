import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers, typingStatus } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();

  // Delete expired typing statuses
  const deletedTyping = await db
    .delete(typingStatus)
    .where(lt(typingStatus.expiresAt, now))
    .returning({ id: typingStatus.id });

  // Set users with updatedAt > 2 minutes ago to offline
  const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

  const offlineUsers = await db
    .update(users)
    .set({ status: "offline", updatedAt: now })
    .where(
      and(
        eq(users.status, "online"),
        lt(users.updatedAt, twoMinutesAgo),
        eq(users.isAgent, false)
      )
    )
    .returning({ id: users.id });

  return NextResponse.json({
    cleaned: {
      expiredTypingStatuses: deletedTyping.length,
      usersSetOffline: offlineUsers.length,
    },
  });
}
