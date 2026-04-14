import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const unread = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      messageId: notifications.messageId,
      message: {
        id: messages.id,
        content: messages.content,
        channelId: messages.channelId,
        conversationId: messages.conversationId,
        createdAt: messages.createdAt,
      },
    })
    .from(notifications)
    .leftJoin(messages, eq(notifications.messageId, messages.id))
    .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  // Enrich with channel info for channel messages
  const channelIds = unread
    .filter((n) => n.message?.channelId)
    .map((n) => n.message!.channelId!);

  let channelMap: Record<string, { id: string; name: string }> = {};
  if (channelIds.length > 0) {
    const chans = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(inArray(channels.id, channelIds));
    channelMap = Object.fromEntries(chans.map((c) => [c.id, c]));
  }

  const enriched = unread.map((n) => ({
    ...n,
    channel: n.message?.channelId ? channelMap[n.message.channelId] || null : null,
  }));

  return NextResponse.json(enriched);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { ids } = body as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.userId, user.id),
        inArray(notifications.id, ids)
      )
    );

  return NextResponse.json({ success: true, marked: ids.length });
}
