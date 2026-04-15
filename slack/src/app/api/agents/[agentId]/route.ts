import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers, workspaceMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { getAgentSkills, removeAgent } from "@/lib/a2a/agent-manager";

export async function GET(
  _request: NextRequest,
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

  const skills = await getAgentSkills(agentId);

  return NextResponse.json({ ...agent, skills });
}

export async function DELETE(
  _request: NextRequest,
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

  // Check ownership: agent creator or workspace owner can delete
  const { user } = auth;
  const card = agent.agentCardJson as { builtBy?: string } | null;
  const isAgentOwner = card?.builtBy === user.id;

  // Check if user is a workspace owner
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

  await removeAgent(agentId);

  return NextResponse.json({ success: true });
}
