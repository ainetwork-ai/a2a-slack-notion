import { db } from "@/lib/db";
import { users, typingStatus } from "@/lib/db/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
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

  // Clear expired status messages/emojis
  const clearedStatuses = await db
    .update(users)
    .set({ statusMessage: null, statusEmoji: null, statusExpiresAt: null, updatedAt: now })
    .where(
      and(
        isNotNull(users.statusExpiresAt),
        lt(users.statusExpiresAt, now)
      )
    )
    .returning({ id: users.id });

  return NextResponse.json({
    cleaned: {
      expiredTypingStatuses: deletedTyping.length,
      usersSetOffline: offlineUsers.length,
      expiredStatuses: clearedStatuses.length,
    },
  });
}
