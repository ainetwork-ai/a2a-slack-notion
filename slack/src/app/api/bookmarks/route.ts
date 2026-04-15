import { db } from "@/lib/db";
import { users, messages, bookmarks, channels, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const rows = await db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      message: {
        id: messages.id,
        content: messages.content,
        contentType: messages.contentType,
        channelId: messages.channelId,
        conversationId: messages.conversationId,
        createdAt: messages.createdAt,
        metadata: messages.metadata,
      },
      sender: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAgent: users.isAgent,
      },
    })
    .from(bookmarks)
    .innerJoin(messages, eq(bookmarks.messageId, messages.id))
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(bookmarks.userId, user.id))
    .orderBy(desc(bookmarks.createdAt));

  return NextResponse.json({ bookmarks: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { messageId } = body as { messageId: string };

  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, user.id), eq(bookmarks.messageId, messageId)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ bookmark: existing, alreadyExists: true });
  }

  const [bookmark] = await db
    .insert(bookmarks)
    .values({ userId: user.id, messageId })
    .returning();

  return NextResponse.json({ bookmark }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { messageId } = body as { messageId: string };

  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, user.id), eq(bookmarks.messageId, messageId)));

  return NextResponse.json({ success: true });
}
