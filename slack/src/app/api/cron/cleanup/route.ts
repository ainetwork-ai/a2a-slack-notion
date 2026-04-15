import { db } from "@/lib/db";
import { users, typingStatus, scheduledMessages, messages, channelMembers } from "@/lib/db/schema";
import { eq, and, lt, isNotNull, lte, gt } from "drizzle-orm";
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

  // Process due scheduled messages
  const dueScheduled = await db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.isSent, false), lte(scheduledMessages.scheduledFor, now)));

  let sentScheduled = 0;
  for (const sm of dueScheduled) {
    try {
      if (sm.channelId) {
        const [membership] = await db
          .select()
          .from(channelMembers)
          .where(and(eq(channelMembers.channelId, sm.channelId), eq(channelMembers.userId, sm.userId)))
          .limit(1);
        if (membership) {
          await db.insert(messages).values({ channelId: sm.channelId, userId: sm.userId, content: sm.content });
        }
      } else if (sm.conversationId) {
        await db.insert(messages).values({ conversationId: sm.conversationId, userId: sm.userId, content: sm.content });
      }
      await db.update(scheduledMessages).set({ isSent: true }).where(eq(scheduledMessages.id, sm.id));
      sentScheduled++;
    } catch {
      // Skip failed sends, will retry next cron run
    }
  }

  // Reset daily auto-response counters for all channel members
  const resetCounters = await db
    .update(channelMembers)
    .set({ autoResponseCount: 0 })
    .where(gt(channelMembers.autoResponseCount, 0))
    .returning({ channelId: channelMembers.channelId });

  return NextResponse.json({
    cleaned: {
      expiredTypingStatuses: deletedTyping.length,
      usersSetOffline: offlineUsers.length,
      expiredStatuses: clearedStatuses.length,
      scheduledMessagesSent: sentScheduled,
      autoResponseCountersReset: resetCounters.length,
    },
  });
}
