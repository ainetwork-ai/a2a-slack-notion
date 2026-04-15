import { db } from "@/lib/db";
import { users, channels, channelMembers, messages } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const archivedOnly = request.nextUrl.searchParams.get("archived") === "true";

  const query = db
    .select({
      channel: channels,
      lastReadAt: channelMembers.lastReadAt,
      role: channelMembers.role,
    })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(
      workspaceId
        ? and(
            eq(channelMembers.userId, user.id),
            eq(channels.workspaceId, workspaceId),
            eq(channels.isArchived, archivedOnly)
          )
        : and(
            eq(channelMembers.userId, user.id),
            eq(channels.isArchived, archivedOnly)
          )
    )
    .orderBy(desc(channels.updatedAt));

  const memberships = await query;

  const channelsWithUnread = await Promise.all(
    memberships.map(async ({ channel, lastReadAt, role }) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channel.id),
            sql`${messages.createdAt} > ${lastReadAt}`,
            sql`${messages.parentId} is null`
          )
        );
      return { ...channel, unreadCount: count, role, lastReadAt };
    })
  );

  return NextResponse.json(channelsWithUnread);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { name, description, isPrivate, workspaceId } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
  }

  const [channel] = await db
    .insert(channels)
    .values({
      name: name.trim(),
      description: description || null,
      isPrivate: isPrivate ?? false,
      createdBy: user.id,
      workspaceId: workspaceId || null,
    })
    .returning();

  await db.insert(channelMembers).values({
    channelId: channel.id,
    userId: user.id,
    role: "owner",
  });

  return NextResponse.json(channel, { status: 201 });
}
