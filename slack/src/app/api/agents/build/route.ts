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

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { name, description, systemPrompt, mcpServerIds } =
    await request.json();

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Agent name is required" },
      { status: 400 }
    );
  }

  const ainAddress = `agent-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  const agentCard = {
    name: name.trim(),
    description: description?.trim() || `Custom agent: ${name.trim()}`,
    systemPrompt: systemPrompt?.trim() || "",
    mcpServerIds: mcpServerIds || [],
    builtBy: user.id,
    provider: { organization: "Slack-A2A" },
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: mcpServerIds?.map((id: string) => ({
      id: `mcp-${id}`,
      name: `MCP: ${id}`,
    })) || [],
  };

  // Create the agent as a user
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
      .values({
        workspaceId: ws.workspaceId,
        userId: agent.id,
        role: "member",
      })
      .onConflictDoNothing();

    // Add to all public channels in the workspace
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
