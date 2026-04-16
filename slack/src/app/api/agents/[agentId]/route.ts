import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getAgentSkills, removeAgent } from "@/lib/a2a/agent-manager";
import { isUuid } from "@/lib/resolve";

async function resolveAgentRow(param: string) {
  if (isUuid(param)) {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, param), eq(users.isAgent, true)))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.isAgent, true),
        or(eq(users.a2aId, param), eq(users.displayName, param))!
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Look up owner info (display name + avatar) from the three places an agent
 * can store its creator: users.agentInvitedBy, users.ownerId, agentCardJson.builtBy.
 */
async function resolveOwner(agent: typeof users.$inferSelect) {
  const card = (agent.agentCardJson ?? {}) as { builtBy?: string };
  const ownerId = agent.ownerId ?? agent.agentInvitedBy ?? card.builtBy ?? null;
  if (!ownerId) return null;

  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      ainAddress: users.ainAddress,
    })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user: viewer } = auth;

  const { agentId } = await params;
  const agent = await resolveAgentRow(agentId);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const [skills, owner] = await Promise.all([
    getAgentSkills(agent.id),
    resolveOwner(agent),
  ]);

  // Is the viewer a workspace owner/admin somewhere? That grants agent-admin
  // privileges inside this workspace.
  const [wsOwnership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, viewer.id),
        or(
          eq(workspaceMembers.role, "owner"),
          eq(workspaceMembers.role, "admin")
        )!
      )
    )
    .limit(1);

  const card = (agent.agentCardJson ?? {}) as { builtBy?: string };
  const isOwner =
    owner?.id === viewer.id ||
    card.builtBy === viewer.id ||
    agent.ownerId === viewer.id ||
    agent.agentInvitedBy === viewer.id;

  const viewerPermission = isOwner
    ? "owner"
    : wsOwnership
    ? "workspace_admin"
    : "viewer";

  return NextResponse.json({
    ...agent,
    skills,
    owner,
    viewerPermission,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { agentId } = await params;
  const agent = await resolveAgentRow(agentId);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { user } = auth;
  const card = agent.agentCardJson as { builtBy?: string } | null;
  const isAgentOwner =
    card?.builtBy === user.id ||
    agent.ownerId === user.id ||
    agent.agentInvitedBy === user.id;

  const [wsOwner] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.role, "owner")))
    .limit(1);

  if (!isAgentOwner && !wsOwner) {
    return NextResponse.json(
      { error: "Only the agent creator or workspace owner can delete this agent" },
      { status: 403 }
    );
  }

  await removeAgent(agent.id);

  return NextResponse.json({ success: true });
}
