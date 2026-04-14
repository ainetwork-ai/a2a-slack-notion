import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
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

  const body = await request.json();
  const { emoji } = body;

  if (!emoji || typeof emoji !== "string") {
    return NextResponse.json({ error: "Emoji is required" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.messageId, messageId),
        eq(reactions.userId, user.id),
        eq(reactions.emoji, emoji)
      )
    )
    .limit(1);

  if (existing) {
    // Toggle: remove if it already exists
    await db.delete(reactions).where(eq(reactions.id, existing.id));
    return NextResponse.json({ toggled: "removed", emoji });
  }

  const [reaction] = await db
    .insert(reactions)
    .values({ messageId, userId: user.id, emoji })
    .returning();

  return NextResponse.json({ toggled: "added", reaction }, { status: 201 });
}
