import { db } from "@/lib/db";
import { typingStatus, users } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");
  const conversationId = searchParams.get("conversationId");

  if (!channelId && !conversationId) {
    return NextResponse.json({ typingUsers: [] });
  }

  const now = new Date();
  const conditions = [gt(typingStatus.expiresAt, now)];

  if (channelId) {
    conditions.push(eq(typingStatus.channelId, channelId));
  } else if (conversationId) {
    conditions.push(eq(typingStatus.conversationId, conversationId));
  }

  const typing = await db
    .select({
      userId: typingStatus.userId,
      displayName: users.displayName,
    })
    .from(typingStatus)
    .innerJoin(users, eq(typingStatus.userId, users.id))
    .where(and(...conditions));

  const typingUsers = typing.filter((t) => t.userId !== user.id);

  return NextResponse.json({ typingUsers });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId, conversationId, isTyping } = await request.json();

  // Remove existing typing status for this user in this context
  const conditions = [eq(typingStatus.userId, user.id)];
  if (channelId) conditions.push(eq(typingStatus.channelId, channelId));
  if (conversationId) conditions.push(eq(typingStatus.conversationId, conversationId));

  await db.delete(typingStatus).where(and(...conditions));

  if (isTyping) {
    await db.insert(typingStatus).values({
      channelId: channelId || null,
      conversationId: conversationId || null,
      userId: user.id,
      expiresAt: new Date(Date.now() + 5000),
    });
  }

  return NextResponse.json({ ok: true });
}
