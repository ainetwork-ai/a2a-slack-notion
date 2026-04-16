import { db } from "@/lib/db";
import { files, messages, users, channelMembers, dmMembers } from "@/lib/db/schema";
import { eq, desc, inArray, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const recentOnly = searchParams.get("recentOnly") === "true";

  // Get channels the user is a member of
  const userChannels = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, user.id));

  // Get DM conversations the user is in
  const userConvs = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, user.id));

  const channelIds = userChannels.map((c) => c.channelId);
  const convIds = userConvs.map((c) => c.conversationId);

  if (channelIds.length === 0 && convIds.length === 0) {
    return NextResponse.json({ files: [] });
  }

  // Find messages that have files
  const messageConditions = [];
  if (channelIds.length > 0) {
    messageConditions.push(inArray(messages.channelId, channelIds));
  }
  if (convIds.length > 0) {
    messageConditions.push(inArray(messages.conversationId, convIds));
  }

  const messageRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(or(...messageConditions));

  const messageIds = messageRows.map((m) => m.id);

  if (messageIds.length === 0) {
    return NextResponse.json({ files: [] });
  }

  const limit = recentOnly ? 20 : 100;

  const result = await db
    .select({
      id: files.id,
      name: files.fileName,
      url: files.fileUrl,
      mimeType: files.mimeType,
      size: files.fileSize,
      createdAt: files.createdAt,
      sender: {
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isAgent: users.isAgent,
      },
    })
    .from(files)
    .innerJoin(users, eq(files.userId, users.id))
    .where(inArray(files.messageId, messageIds))
    .orderBy(desc(files.createdAt))
    .limit(limit);

  return NextResponse.json({ files: result });
}
