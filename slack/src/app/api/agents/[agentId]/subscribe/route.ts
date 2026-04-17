import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import {
  users,
  workspaceMembers,
  channels,
  channelMembers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/agents/:agentId/subscribe
 *
 * Adds the agent to all workspaces the caller belongs to (and their public
 * channels). Used by the Browse tab to "invite" an existing public agent —
 * unlike POST /api/agents (which expects an A2A URL), this targets an agent
 * that's already registered in the database.
 *
 * Idempotent. If the agent is already in the caller's workspaces, this is a
 * no-op for those rows.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { agentId } = await params;

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Public-only — private agents can't be subscribed by other users
  if (agent.agentVisibility === "private" && agent.agentInvitedBy !== auth.user.id) {
    return NextResponse.json(
      { error: "This agent is private. The owner must make it public or unlisted first." },
      { status: 403 }
    );
  }

  const callerWorkspaces = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, auth.user.id));

  let workspacesAdded = 0;
  let channelsAdded = 0;

  for (const ws of callerWorkspaces) {
    const inserted = await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws.workspaceId, userId: agent.id, role: "member" })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) workspacesAdded++;

    const publicChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.workspaceId, ws.workspaceId),
          eq(channels.isPrivate, false)
        )
      );

    for (const ch of publicChannels) {
      const insertedCh = await db
        .insert(channelMembers)
        .values({ channelId: ch.id, userId: agent.id, role: "member" })
        .onConflictDoNothing()
        .returning();
      if (insertedCh.length > 0) channelsAdded++;
    }
  }

  return NextResponse.json({
    agent: {
      id: agent.id,
      displayName: agent.displayName,
      avatarUrl: agent.avatarUrl,
    },
    workspacesAdded,
    channelsAdded,
  });
}
