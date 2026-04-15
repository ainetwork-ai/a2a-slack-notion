import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { sendToAgent } from "@/lib/a2a/message-bridge";
import { handleBuilderMessage } from "@/lib/a2a/builder-agent";

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
    db
      .select({ messageId: reactions.messageId, emoji: reactions.emoji, userId: reactions.userId, displayName: users.displayName })
      .from(reactions)
      .innerJoin(users, eq(reactions.userId, users.id))
      .where(inArray(reactions.messageId, messageIds)),
    db.select().from(files).where(inArray(files.messageId, messageIds)),
  ]);

  const reactionsByMessage = msgReactions.reduce<Record<string, Record<string, { userId: string; displayName: string }[]>>>(
    (acc, r) => {
      if (!acc[r.messageId]) acc[r.messageId] = {};
      if (!acc[r.messageId][r.emoji]) acc[r.messageId][r.emoji] = [];
      acc[r.messageId][r.emoji].push({ userId: r.userId, displayName: r.displayName });
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
      agentCardJson: users.agentCardJson,
      isMuted: dmMembers.isMuted,
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

  // Create notifications for other members who have not muted the conversation
  const notifiableMembers = otherMembers.filter((m) => !m.isMuted);
  if (notifiableMembers.length > 0) {
    await db.insert(notifications).values(
      notifiableMembers.map((m) => ({
        userId: m.userId,
        messageId: message.id,
        type: mentionedMemberIds.has(m.userId) ? "mention" : "dm",
      }))
    );

    // Send to agents async (built agents are handled by frontend streaming)
    for (const member of otherMembers) {
      if (!member.isAgent) continue;

      // Builder agent: intercept and handle via natural conversation
      if (isBuilderAgent(member)) {
        handleBuilderMessage(content, user.id)
          .then(async (result) => {
            await db.insert(messages).values({
              conversationId,
              userId: member.userId,
              content: result.response,
              contentType: "agent-response",
              metadata: {
                agentName: member.displayName,
                builder: true,
                createdAgents: result.createdAgents,
                createdChannel: result.createdChannel,
              },
            });
            await db
              .update(dmConversations)
              .set({ updatedAt: new Date() })
              .where(eq(dmConversations.id, conversationId));
          })
          .catch(() => {
            // Fire-and-forget
          });
        continue;
      }

      // External A2A agent
      if (member.a2aUrl) {
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

/**
 * Detect whether a DM member is a Builder agent.
 * Matches by display name containing "builder" or agentCardJson.isBuilder flag.
 */
function isBuilderAgent(member: {
  displayName: string;
  isAgent: boolean;
  agentCardJson: unknown;
}): boolean {
  if (!member.isAgent) return false;
  if (/builder/i.test(member.displayName)) return true;
  const card = member.agentCardJson as Record<string, unknown> | null;
  if (card?.isBuilder === true) return true;
  const skills = card?.skills as Array<{ id?: string }> | undefined;
  if (skills?.some((s) => s.id === "create-agent" || s.id === "build-agent")) return true;
  return false;
}
