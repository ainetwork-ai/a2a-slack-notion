import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, threadSubscriptions } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { sendToAgent } from "@/lib/a2a/message-bridge";

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
  const { content, metadata } = body;

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
      metadata: metadata || null,
    })
    .returning();

  // Increment threadCount on parent
  await db
    .update(messages)
    .set({ threadCount: sql`${messages.threadCount} + 1`, updatedAt: new Date() })
    .where(eq(messages.id, messageId));

  // Parse @mentions + dispatch to agent(s). Thread replies previously
  // skipped this, so @agent mentions in a thread never triggered a response.
  {
    const broadcastPattern = /@(channel|here|everyone)\b/i;
    if (!broadcastPattern.test(content)) {
      const mentionPattern = /@(\S+)/g;
      const mentionedNames: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = mentionPattern.exec(content)) !== null) {
        const token = m[1];
        mentionedNames.push(token);
        const firstWord = token.split(/[(,]/)[0];
        if (firstWord && firstWord !== token) mentionedNames.push(firstWord);
      }

      if (mentionedNames.length > 0) {
        const mentionedUsers = await db
          .select()
          .from(users)
          .where(
            or(
              inArray(users.displayName, mentionedNames),
              ...mentionedNames.map((n) => ilike(users.displayName, `${n}%`))
            )
          );

        if (mentionedUsers.length > 0) {
          // Store mention rows + notifications
          await db.insert(mentions).values(
            mentionedUsers.map((u) => ({ messageId: reply.id, userId: u.id }))
          );
          const mentionedIds = new Set(mentionedUsers.map((u) => u.id));
          const notifyIds = Array.from(mentionedIds).filter((id) => id !== user.id);
          if (notifyIds.length > 0) {
            await db.insert(notifications).values(
              notifyIds.map((userId) => ({ userId, messageId: reply.id, type: "mention" }))
            );
          }

          // Fire-and-forget agent dispatches. Pass skillId from metadata so
          // skill-invocation replies actually reach the agent with the hint.
          const skillId =
            metadata && typeof metadata === "object" && typeof (metadata as { skillId?: unknown }).skillId === "string"
              ? (metadata as { skillId: string }).skillId
              : undefined;
          const agentUsers = mentionedUsers.filter((u) => u.isAgent);
          for (const agent of agentUsers) {
            sendToAgent({
              agentId: agent.id,
              text: content,
              channelId: parent.channelId ?? undefined,
              conversationId: parent.conversationId ?? undefined,
              skillId,
              messageId: reply.id,
              senderName: user.displayName,
            }).catch((err) => {
              console.error(`[thread-reply] sendToAgent failed for ${agent.displayName}:`, err);
            });
          }
        }
      }
    }
  }

  // Auto-subscribe the replier to the thread
  await db
    .insert(threadSubscriptions)
    .values({ userId: user.id, messageId })
    .onConflictDoNothing();

  // Notify all subscribers (except the replier themselves)
  const subscribers = await db
    .select({ userId: threadSubscriptions.userId })
    .from(threadSubscriptions)
    .where(eq(threadSubscriptions.messageId, messageId));

  const subscriberIds = subscribers
    .map((s) => s.userId)
    .filter((id) => id !== user.id);

  if (subscriberIds.length > 0) {
    await db.insert(notifications).values(
      subscriberIds.map((userId) => ({
        userId,
        messageId: reply.id,
        type: "thread_reply",
      }))
    );
  } else if (parent.userId !== user.id) {
    // Fallback: notify parent author if no subscribers yet
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
