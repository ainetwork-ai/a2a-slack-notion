import { db } from "@/lib/db";
import { messages, notifications, typingStatus, users, channels, channelMembers } from "@/lib/db/schema";
import { eq, and, gt, desc, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest } from "next/server";

// Node runtime required — iron-session uses cookies() which is not available on Edge
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let lastMessageTimestamp = new Date();
  let lastNotificationTimestamp = new Date();

  const encoder = new TextEncoder();

  function formatSSE(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection confirmation
      controller.enqueue(formatSSE("connected", { userId: user.id, ts: Date.now() }));

      // Determine channels the user belongs to for scoped queries
      async function getUserChannelIds(): Promise<string[]> {
        const memberships = await db
          .select({ channelId: channelMembers.channelId })
          .from(channelMembers)
          .where(eq(channelMembers.userId, user.id));
        return memberships.map((m) => m.channelId);
      }

      let active = true;
      request.signal.addEventListener("abort", () => {
        active = false;
      });

      while (active) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!active) break;

        try {
          // Poll for new messages in channels the user belongs to
          const channelIds = await getUserChannelIds();
          if (channelIds.length > 0) {
            const newMessages = await db
              .select({
                id: messages.id,
                content: messages.content,
                channelId: messages.channelId,
                conversationId: messages.conversationId,
                userId: messages.userId,
                createdAt: messages.createdAt,
              })
              .from(messages)
              .where(
                and(
                  gt(messages.createdAt, lastMessageTimestamp),
                  inArray(messages.channelId, channelIds)
                )
              )
              .orderBy(desc(messages.createdAt))
              .limit(20);

            if (newMessages.length > 0) {
              lastMessageTimestamp = new Date(newMessages[0].createdAt);
              for (const msg of newMessages.reverse()) {
                controller.enqueue(formatSSE("message", msg));
              }
            }
          }

          // Poll for new notifications
          const newNotifications = await db
            .select({
              id: notifications.id,
              type: notifications.type,
              isRead: notifications.isRead,
              createdAt: notifications.createdAt,
              messageId: notifications.messageId,
            })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, user.id),
                gt(notifications.createdAt, lastNotificationTimestamp)
              )
            )
            .orderBy(desc(notifications.createdAt))
            .limit(20);

          if (newNotifications.length > 0) {
            lastNotificationTimestamp = new Date(newNotifications[0].createdAt);
            controller.enqueue(formatSSE("notification", { items: newNotifications }));
          }

          // Poll typing indicators for user's channels
          if (channelIds.length > 0) {
            const now = new Date();
            const typing = await db
              .select({
                userId: typingStatus.userId,
                displayName: users.displayName,
                channelId: typingStatus.channelId,
                conversationId: typingStatus.conversationId,
              })
              .from(typingStatus)
              .innerJoin(users, eq(typingStatus.userId, users.id))
              .where(
                and(
                  gt(typingStatus.expiresAt, now),
                  inArray(typingStatus.channelId, channelIds)
                )
              );

            const others = typing.filter((t) => t.userId !== user.id);
            if (others.length > 0) {
              controller.enqueue(formatSSE("typing", { users: others }));
            }
          }

          // Poll presence/status changes for workspace members
          const presence = await db
            .select({
              id: users.id,
              displayName: users.displayName,
              status: users.status,
              statusMessage: users.statusMessage,
              updatedAt: users.updatedAt,
            })
            .from(users)
            .where(gt(users.updatedAt, new Date(Date.now() - 4000)))
            .limit(20);

          if (presence.length > 0) {
            controller.enqueue(formatSSE("presence", { users: presence }));
          }
        } catch {
          // ignore polling errors; keep stream alive
        }
      }

      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
