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

export interface AgentSkillDef {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { name, description, systemPrompt, mcpAccess, skills } =
    await request.json();

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Agent name is required" },
      { status: 400 }
    );
  }

  const ainAddress = `agent-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  // Skills are high-level abilities defined by the user
  // mcpAccess is the list of MCP servers the agent can use as tools
  const agentSkills: AgentSkillDef[] = (skills || []).map(
    (s: { id?: string; name: string; description: string; instruction?: string }) => ({
      id: s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: s.name,
      description: s.description,
      instruction: s.instruction || "",
    })
  );

  // Always include slack in mcpAccess (agents need workspace awareness)
  const mcpAccessList: string[] = Array.from(
    new Set([...(mcpAccess || []), "slack"])
  );

  const agentCard = {
    name: name.trim(),
    description: description?.trim() || `Custom agent: ${name.trim()}`,
    systemPrompt: systemPrompt?.trim() || "",
    mcpAccess: mcpAccessList,
    skills: agentSkills,
    builtBy: user.id,
    provider: { organization: "Slack-A2A" },
    version: "2.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      memory: true,
      toolUse: true,
    },
  };

  const [agent] = await db
    .insert(users)
    .values({
      ainAddress,
      displayName: name.trim(),
      isAgent: true,
      status: "online",
      agentCardJson: agentCard,
    })
    .returning();

  // Add agent to all workspaces the creator belongs to
  const creatorWorkspaces = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id));

  for (const ws of creatorWorkspaces) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws.workspaceId, userId: agent.id, role: "member" })
      .onConflictDoNothing();

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
      await db
        .insert(channelMembers)
        .values({ channelId: ch.id, userId: agent.id, role: "member" })
        .onConflictDoNothing();
    }
  }

  return NextResponse.json(agent);
}
