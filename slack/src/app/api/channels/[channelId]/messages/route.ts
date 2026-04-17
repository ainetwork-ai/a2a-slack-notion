import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, outgoingWebhooks, workflows } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { sendToAgent } from "@/lib/a2a/message-bridge";
import { checkAutoEngagement } from "@/lib/a2a/auto-engage";
import { runWorkflow } from "@/lib/workflow/executor";
import { onMessageCreated } from "@/lib/search/hooks";

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
  const parentIdsWithReplies = msgs.filter((m) => (m.threadCount ?? 0) > 0).map((m) => m.id);

  const [msgReactions, msgFiles, threadReplies] = await Promise.all([
    db
      .select({ messageId: reactions.messageId, emoji: reactions.emoji, userId: reactions.userId, displayName: users.displayName })
      .from(reactions)
      .innerJoin(users, eq(reactions.userId, users.id))
      .where(inArray(reactions.messageId, messageIds)),
    db
      .select()
      .from(files)
      .where(inArray(files.messageId, messageIds)),
    parentIdsWithReplies.length > 0
      ? db
          .select({
            parentId: messages.parentId,
            createdAt: messages.createdAt,
            userId: messages.userId,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
            isAgent: users.isAgent,
          })
          .from(messages)
          .innerJoin(users, eq(messages.userId, users.id))
          .where(inArray(messages.parentId, parentIdsWithReplies))
          .orderBy(desc(messages.createdAt))
      : Promise.resolve([] as Array<{
          parentId: string | null;
          createdAt: Date;
          userId: string;
          displayName: string;
          avatarUrl: string | null;
          isAgent: boolean;
        }>),
  ]);

  const threadPreviewByParent = threadReplies.reduce<
    Record<string, { lastReplyAt: string; participants: Array<{ id: string; displayName: string; avatarUrl: string | null; isAgent: boolean }> }>
  >((acc, r) => {
    if (!r.parentId) return acc;
    if (!acc[r.parentId]) {
      acc[r.parentId] = { lastReplyAt: r.createdAt.toISOString(), participants: [] };
    }
    const seen = acc[r.parentId].participants.some((p) => p.id === r.userId);
    if (!seen && acc[r.parentId].participants.length < 4) {
      acc[r.parentId].participants.push({
        id: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        isAgent: r.isAgent,
      });
    }
    return acc;
  }, {});

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
    threadLastReplyAt: threadPreviewByParent[m.id]?.lastReplyAt ?? null,
    threadParticipants: threadPreviewByParent[m.id]?.participants ?? [],
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

  // Index message for search (best-effort)
  onMessageCreated({
    id: message.id,
    content: message.content,
    senderName: user.displayName,
    workspaceId: null,
    channelId,
    conversationId: null,
    senderId: user.id,
    createdAt: message.createdAt.getTime(),
  });

  // Fire outgoing webhooks that match this message
  {
    const [channel] = await db
      .select({ name: channels.name, workspaceId: channels.workspaceId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (channel) {
      const hooks = await db
        .select()
        .from(outgoingWebhooks)
        .where(
          and(
            eq(outgoingWebhooks.workspaceId, channel.workspaceId!),
            or(
              isNull(outgoingWebhooks.channelId),
              eq(outgoingWebhooks.channelId, channelId)
            )
          )
        );

      for (const hook of hooks) {
        const words = hook.triggerWords.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
        const lowerContent = content.trimStart().toLowerCase();
        const matched = words.find((w) => lowerContent.startsWith(w));
        if (matched) {
          fetch(hook.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: content,
              user_name: user.displayName,
              channel_name: channel.name,
              trigger_word: matched,
              timestamp: message.createdAt.toISOString(),
            }),
          }).catch(() => {
            // Fire-and-forget, don't block response
          });
        }
      }
    }
  }

  // Fire auto-engagement check asynchronously (don't block response)
  checkAutoEngagement({
    channelId,
    messageContent: content,
    senderId: user.id,
  }).catch(() => {
    // Fire-and-forget, ignore errors
  });

  // Trigger channel_message workflows
  {
    const [channelRow] = await db
      .select({ workspaceId: channels.workspaceId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (channelRow?.workspaceId) {
      const matchingWorkflows = await db
        .select()
        .from(workflows)
        .where(
          and(
            eq(workflows.workspaceId, channelRow.workspaceId),
            eq(workflows.triggerType, "channel_message"),
            eq(workflows.enabled, true)
          )
        );

      for (const wf of matchingWorkflows) {
        const config = wf.triggerConfig as { channelId?: string; pattern?: string } | null;
        if (config?.channelId && config.channelId !== channelId) continue;
        if (config?.pattern) {
          try {
            if (!new RegExp(config.pattern).test(content)) continue;
          } catch {
            continue;
          }
        }
        // Strip the trigger pattern from the message so downstream steps
        // get only the article source / topic, not the command keyword.
        const body = config?.pattern
          ? content.replace(new RegExp(config.pattern), "").trim()
          : content;
        runWorkflow(wf.id, {
          trigger: { message: content, body, userId: user.id, channelId },
        }).catch(() => {
          // Fire-and-forget
        });
      }
    }
  }

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
        const agentUsers = mentionedUsers.filter((u) => u.isAgent);
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
