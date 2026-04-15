import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { sendToAgent } from "@/lib/a2a/message-bridge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { conversationId } = await params;

  const [membership] = await db
    .select()
    .from(dmMembers)
    .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");

  const conditions = [
    eq(messages.conversationId, conversationId),
    sql`${messages.parentId} is null`,
  ];
  if (before) {
    conditions.push(lt(messages.createdAt, new Date(before)));
  }

  const msgs = await db
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
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  if (msgs.length === 0) {
    return NextResponse.json({ messages: [], nextCursor: null });
  }

  const messageIds = msgs.map((m) => m.id);

  const [msgReactions, msgFiles] = await Promise.all([
    db.select().from(reactions).where(inArray(reactions.messageId, messageIds)),
    db.select().from(files).where(inArray(files.messageId, messageIds)),
  ]);

  const reactionsByMessage = msgReactions.reduce<Record<string, Record<string, number>>>(
    (acc, r) => {
      if (!acc[r.messageId]) acc[r.messageId] = {};
      acc[r.messageId][r.emoji] = (acc[r.messageId][r.emoji] || 0) + 1;
      return acc;
    },
    {}
  );

  const filesByMessage = msgFiles.reduce<Record<string, typeof msgFiles>>(
    (acc, f) => {
      if (!acc[f.messageId]) acc[f.messageId] = [];
      acc[f.messageId].push(f);
      return acc;
    },
    {}
  );

  const enriched = msgs.map((m) => ({
    ...m,
    reactions: reactionsByMessage[m.id] || {},
    files: filesByMessage[m.id] || [],
  }));

  const nextCursor =
    msgs.length === 50 ? msgs[msgs.length - 1].createdAt.toISOString() : null;

  return NextResponse.json({ messages: enriched, nextCursor });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { conversationId } = await params;

  const [membership] = await db
    .select()
    .from(dmMembers)
    .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await request.json();
  const { content, metadata, parentId } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const [message] = await db
    .insert(messages)
    .values({ conversationId, userId: user.id, content, metadata: metadata || null, parentId: parentId || null })
    .returning();

  // Update conversation updatedAt
  await db
    .update(dmConversations)
    .set({ updatedAt: new Date() })
    .where(eq(dmConversations.id, conversationId));

  // Get other members for notifications and agent check
  const otherMembers = await db
    .select({
      userId: dmMembers.userId,
      displayName: users.displayName,
      isAgent: users.isAgent,
      a2aUrl: users.a2aUrl,
    })
    .from(dmMembers)
    .innerJoin(users, eq(dmMembers.userId, users.id))
    .where(and(eq(dmMembers.conversationId, conversationId), sql`${dmMembers.userId} != ${user.id}`));

  // Determine notification type: "mention" if a member is @mentioned, otherwise "dm"
  const mentionPattern = /@(\S+)/g;
  const mentionedNames: string[] = [];
  let mentionMatch;
  while ((mentionMatch = mentionPattern.exec(content)) !== null) {
    const token = mentionMatch[1];
    mentionedNames.push(token.toLowerCase());
    const firstWord = token.split(/[(,]/)[0];
    if (firstWord && firstWord !== token) mentionedNames.push(firstWord.toLowerCase());
  }

  const mentionedMemberIds = new Set(
    otherMembers
      .filter((m) => mentionedNames.some((n) => m.displayName.toLowerCase().startsWith(n)))
      .map((m) => m.userId)
  );

  // Create notifications for all other members
  if (otherMembers.length > 0) {
    await db.insert(notifications).values(
      otherMembers.map((m) => ({
        userId: m.userId,
        messageId: message.id,
        type: mentionedMemberIds.has(m.userId) ? "mention" : "dm",
      }))
    );

    // Send to agents async
    for (const member of otherMembers) {
      if (member.isAgent && member.a2aUrl) {
        sendToAgent({
          agentId: member.userId,
          text: content,
          conversationId,
        }).catch(() => {
          // Fire-and-forget
        });
      }
    }
  }

  const [messageWithUser] = await db
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
    .where(eq(messages.id, message.id))
    .limit(1);

  return NextResponse.json(messageWithUser, { status: 201 });
}
