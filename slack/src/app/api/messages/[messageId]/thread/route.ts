import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { messageId } = await params;

  const [parent] = await db
    .select({
      id: messages.id,
      content: messages.content,
      contentType: messages.contentType,
      metadata: messages.metadata,
      threadCount: messages.threadCount,
      isEdited: messages.isEdited,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      userId: messages.userId,
      parentId: messages.parentId,
      channelId: messages.channelId,
      conversationId: messages.conversationId,
      user: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAgent: users.isAgent,
      },
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!parent) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const threadMessages = await db
    .select({
      id: messages.id,
      content: messages.content,
      contentType: messages.contentType,
      metadata: messages.metadata,
      threadCount: messages.threadCount,
      isEdited: messages.isEdited,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      userId: messages.userId,
      parentId: messages.parentId,
      user: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAgent: users.isAgent,
      },
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.parentId, messageId))
    .orderBy(messages.createdAt);

  return NextResponse.json({ parent, thread: threadMessages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { messageId } = await params;

  const [parent] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!parent) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const body = await request.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const [reply] = await db
    .insert(messages)
    .values({
      channelId: parent.channelId,
      conversationId: parent.conversationId,
      parentId: messageId,
      userId: user.id,
      content,
    })
    .returning();

  // Increment threadCount on parent
  await db
    .update(messages)
    .set({ threadCount: sql`${messages.threadCount} + 1`, updatedAt: new Date() })
    .where(eq(messages.id, messageId));

  // Notify parent author if different user
  if (parent.userId !== user.id) {
    await db.insert(notifications).values({
      userId: parent.userId,
      messageId: reply.id,
      type: "thread_reply",
    });
  }

  const [replyWithUser] = await db
    .select({
      id: messages.id,
      content: messages.content,
      contentType: messages.contentType,
      metadata: messages.metadata,
      threadCount: messages.threadCount,
      isEdited: messages.isEdited,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      userId: messages.userId,
      parentId: messages.parentId,
      user: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAgent: users.isAgent,
      },
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.id, reply.id))
    .limit(1);

  return NextResponse.json(replyWithUser, { status: 201 });
}
