import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import {
  workspaces,
  workspaceMembers,
  channels,
  channelMembers,
  messages,
  files,
  users,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveWorkspaceParam } from "@/lib/resolve";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { workspaceId: param } = await params;
  const ws = await resolveWorkspaceParam(param);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Only workspace owners/admins can export
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id)
      )
    )
    .limit(1);

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch workspace info
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Fetch members with user info
  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
      displayName: users.displayName,
      ainAddress: users.ainAddress,
      isAgent: users.isAgent,
      avatarUrl: users.avatarUrl,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  // Fetch channels
  const workspaceChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId));

  const channelIds = workspaceChannels.map((c) => c.id);

  // Fetch messages for all channels
  let allMessages: Array<Record<string, unknown>> = [];
  if (channelIds.length > 0) {
    const messageRows = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        userId: messages.userId,
        content: messages.content,
        contentType: messages.contentType,
        parentId: messages.parentId,
        threadCount: messages.threadCount,
        isEdited: messages.isEdited,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
      })
      .from(messages)
      .where(
        // Filter to workspace channels only using a subquery-free approach
        // by iterating — this is acceptable for export which is infrequent
        eq(messages.channelId, channelIds[0])
      );

    // For multiple channels, fetch them all
    if (channelIds.length === 1) {
      allMessages = messageRows as Array<Record<string, unknown>>;
    } else {
      const chunks = await Promise.all(
        channelIds.map((cid) =>
          db
            .select({
              id: messages.id,
              channelId: messages.channelId,
              userId: messages.userId,
              content: messages.content,
              contentType: messages.contentType,
              parentId: messages.parentId,
              threadCount: messages.threadCount,
              isEdited: messages.isEdited,
              createdAt: messages.createdAt,
              updatedAt: messages.updatedAt,
            })
            .from(messages)
            .where(eq(messages.channelId, cid))
        )
      );
      allMessages = chunks.flat() as Array<Record<string, unknown>>;
    }
  }

  // Fetch files metadata
  let allFiles: Array<Record<string, unknown>> = [];
  if (channelIds.length > 0) {
    const messageIds = allMessages.map((m) => m.id as string);
    if (messageIds.length > 0) {
      const fileChunks = await Promise.all(
        messageIds.map((mid) =>
          db
            .select({
              id: files.id,
              messageId: files.messageId,
              userId: files.userId,
              fileName: files.fileName,
              fileUrl: files.fileUrl,
              fileSize: files.fileSize,
              mimeType: files.mimeType,
              createdAt: files.createdAt,
            })
            .from(files)
            .where(eq(files.messageId, mid))
        )
      );
      allFiles = fileChunks.flat() as Array<Record<string, unknown>>;
    }
  }

  // Fetch channel memberships
  const channelMemberRows = channelIds.length > 0
    ? (
        await Promise.all(
          channelIds.map((cid) =>
            db
              .select({
                channelId: channelMembers.channelId,
                userId: channelMembers.userId,
                role: channelMembers.role,
                joinedAt: channelMembers.joinedAt,
              })
              .from(channelMembers)
              .where(eq(channelMembers.channelId, cid))
          )
        )
      ).flat()
    : [];

  const exportData = {
    exportedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      createdAt: workspace.createdAt,
    },
    members,
    channels: workspaceChannels,
    channelMembers: channelMemberRows,
    messages: allMessages,
    files: allFiles,
  };

  return NextResponse.json(exportData);
}
