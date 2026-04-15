import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { sendToAgent } from "@/lib/a2a/message-bridge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");

  const conditions = [
    eq(messages.channelId, channelId),
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
      .select()
      .from(reactions)
      .where(inArray(reactions.messageId, messageIds)),
    db
      .select()
      .from(files)
      .where(inArray(files.messageId, messageIds)),
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
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
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
    .values({
      channelId,
      userId: user.id,
      content,
      metadata: metadata || null,
      parentId: parentId || null,
    })
    .returning();

  // Parse @mentions from content
  const broadcastMentionPattern = /@(channel|here|everyone)\b/i;
  const isBroadcast = broadcastMentionPattern.test(content);

  if (isBroadcast) {
    // @channel/@here/@everyone — notify all channel members except sender
    const allMembers = await db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), sql`${channelMembers.userId} != ${user.id}`));

    if (allMembers.length > 0) {
      await db.insert(notifications).values(
        allMembers.map((m) => ({
          userId: m.userId,
          messageId: message.id,
          type: "mention",
        }))
      );
    }
  } else {
    // Parse named @mentions — collect full token and first-word variant
    const mentionPattern = /@(\S+)/g;
    const mentionedNames: string[] = [];
    let match;
    while ((match = mentionPattern.exec(content)) !== null) {
      const token = match[1];
      mentionedNames.push(token);
      // Also try first word in case display name has spaces (e.g. "Techa" from "@Techa (Bill Gates)")
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
            ...mentionedNames.map(n => ilike(users.displayName, `${n}%`))
          )
        );

      if (mentionedUsers.length > 0) {
        await db.insert(mentions).values(
          mentionedUsers.map((u) => ({ messageId: message.id, userId: u.id }))
        );

        await db.insert(notifications).values(
          mentionedUsers.map((u) => ({
            userId: u.id,
            messageId: message.id,
            type: "mention",
          }))
        );

        // Send to agent users asynchronously
        const agentUsers = mentionedUsers.filter((u) => u.isAgent && u.a2aUrl);
        for (const agent of agentUsers) {
          sendToAgent({
            agentId: agent.id,
            text: content,
            channelId,
          }).catch(() => {
            // Async fire-and-forget, don't block response
          });
        }
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
