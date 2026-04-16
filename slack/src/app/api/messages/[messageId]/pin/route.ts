import { db } from "@/lib/db";
import { messages, channelMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { messageId } = await params;

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Only channel members can pin (channel messages only)
  if (message.channelId) {
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.channelId, message.channelId),
          eq(channelMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not a channel member" }, { status: 403 });
    }
  }

  // Toggle: set pinnedAt to now if null, null if already set
  const newPinnedAt = message.pinnedAt ? null : new Date();
  const isPinning = newPinnedAt !== null;

  await db
    .update(messages)
    .set({ pinnedAt: newPinnedAt })
    .where(eq(messages.id, messageId));

  // Post a system message when pinning (not unpinning) in a channel
  if (isPinning && message.channelId) {
    const [actor] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const actorName = actor?.displayName ?? "Someone";
    const preview = message.content.slice(0, 60) + (message.content.length > 60 ? "…" : "");

    await db.insert(messages).values({
      channelId: message.channelId,
      userId: user.id,
      content: `${actorName} pinned a message: "${preview}"`,
      contentType: "system",
    });
  }

  return NextResponse.json({ pinned: isPinning });
}
