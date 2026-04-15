import { db } from "@/lib/db";
import { channels, channelMembers } from "@/lib/db/schema";
import { eq, and, desc, sql, ilike, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const q = request.nextUrl.searchParams.get("q");

  // Build conditions for all public, non-archived channels
  const conditions = [
    eq(channels.isPrivate, false),
    eq(channels.isArchived, false),
  ];

  if (workspaceId) {
    conditions.push(eq(channels.workspaceId, workspaceId));
  }

  if (q) {
    conditions.push(ilike(channels.name, `%${q}%`));
  }

  const allChannels = await db
    .select()
    .from(channels)
    .where(and(...conditions))
    .orderBy(desc(channels.updatedAt));

  if (allChannels.length === 0) return NextResponse.json([]);

  const channelIds = allChannels.map((c) => c.id);

  // Get the user's memberships for filtering
  const memberships = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(
      and(
        eq(channelMembers.userId, user.id),
        inArray(channelMembers.channelId, channelIds)
      )
    );

  const memberSet = new Set(memberships.map((m) => m.channelId));

  // Get member counts per channel
  const memberCounts = await db
    .select({
      channelId: channelMembers.channelId,
      count: sql<number>`count(*)::int`,
    })
    .from(channelMembers)
    .where(inArray(channelMembers.channelId, channelIds))
    .groupBy(channelMembers.channelId);

  const countMap = new Map(memberCounts.map((c) => [c.channelId, c.count]));

  const result = allChannels.map((channel) => ({
    ...channel,
    memberCount: countMap.get(channel.id) ?? 0,
    isMember: memberSet.has(channel.id),
  }));

  return NextResponse.json(result);
}
