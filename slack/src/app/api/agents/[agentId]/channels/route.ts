import { db } from "@/lib/db";
import { users, channels, channelMembers } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/resolve";

/**
 * GET /api/agents/[agentId]/channels
 *
 * Returns every channel this agent is a member of, along with the
 * engagement level and auto-response counters per channel. Used by the
 * agent profile panel to show "active in: #newsroom (engaged), …".
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { agentId: param } = await params;

  const [agent] = isUuid(param)
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, param), eq(users.isAgent, true)))
        .limit(1)
    : await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.isAgent, true),
            or(eq(users.a2aId, param), eq(users.displayName, param))!
          )
        )
        .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      channelId: channels.id,
      channelName: channels.name,
      isPrivate: channels.isPrivate,
      isArchived: channels.isArchived,
      workspaceId: channels.workspaceId,
      engagementLevel: channelMembers.engagementLevel,
      lastAutoResponseAt: channelMembers.lastAutoResponseAt,
      autoResponseCount: channelMembers.autoResponseCount,
    })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(eq(channelMembers.userId, agent.id));

  return NextResponse.json(
    rows
      // hide archived channels unless there's activity
      .filter((r) => !r.isArchived || (r.autoResponseCount ?? 0) > 0)
      .sort((a, b) => a.channelName.localeCompare(b.channelName))
  );
}
