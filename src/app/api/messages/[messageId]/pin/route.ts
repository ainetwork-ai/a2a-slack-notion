import { db } from "@/lib/db";
import { messages, channelMembers } from "@/lib/db/schema";
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

  await db
    .update(messages)
    .set({ pinnedAt: newPinnedAt })
    .where(eq(messages.id, messageId));

  return NextResponse.json({ pinned: newPinnedAt !== null });
}
