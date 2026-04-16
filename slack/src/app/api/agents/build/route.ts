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

interface AgentDefinition {
  name: string;
  description?: string;
  systemPrompt?: string;
  mcpAccess?: string[];
  skills?: { id?: string; name: string; description: string; instruction?: string }[];
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    extensions?: { uri: string; description: string; required: boolean }[];
  };
}

async function createSingleAgent(agentDef: AgentDefinition, userId: string) {
  const { name, description, systemPrompt, mcpAccess, skills, capabilities } = agentDef;

  const ainAddress = `agent-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  const agentSkills: AgentSkillDef[] = (skills || []).map(
    (s) => ({
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

  const agentCard: Record<string, unknown> = {
    name: name.trim(),
    description: description?.trim() || `Custom agent: ${name.trim()}`,
    systemPrompt: systemPrompt?.trim() || "",
    mcpAccess: mcpAccessList,
    skills: agentSkills,
    builtBy: userId,
    provider: { organization: "Slack-A2A" },
    version: "2.0.0",
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    capabilities: {
      streaming: capabilities?.streaming ?? false,
      pushNotifications: capabilities?.pushNotifications ?? false,
      stateTransitionHistory: false,
      extensions: [
        ...(capabilities?.extensions || []),
        { uri: "urn:a2a:ext:memory", description: "Persistent agent memory across conversations", required: false },
        { uri: "urn:a2a:ext:tool-use", description: "LLM-driven MCP tool invocation", required: false },
      ],
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

  // Register with a2a-builder to get an actual A2A endpoint
  try {
    const builderRes = await fetch("https://a2a-builder.ainetwork.ai/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description?.trim() || "",
        systemPrompt: systemPrompt?.trim() || "",
        skills: agentSkills,
      }),
    });
    if (builderRes.ok) {
      const builderData = await builderRes.json();
      const a2aUrl =
        builderData.url ||
        builderData.a2aUrl ||
        `https://a2a-builder.ainetwork.ai/api/agents/${builderData.id || builderData.agentId}`;
      agentCard.url = a2aUrl;
      await db
        .update(users)
        .set({ a2aUrl, agentCardJson: { ...agentCard, url: a2aUrl } })
        .where(eq(users.id, agent.id));
      agent.a2aUrl = a2aUrl;
    }
  } catch (e) {
    console.error("[Agent Build] Failed to register with a2a-builder:", e);
    // Agent is still created locally but won't have A2A URL
  }

  // Add agent to all workspaces the creator belongs to
  const creatorWorkspaces = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

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

  return agent;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();

  // Support both single agent object and array of agents
  const agentDefs: AgentDefinition[] = Array.isArray(body) ? body : [body];

  for (const agentDef of agentDefs) {
    if (!agentDef.name?.trim()) {
      return NextResponse.json(
        { error: "Agent name is required" },
        { status: 400 }
      );
    }
  }

  const results = [];
  for (const agentDef of agentDefs) {
    const agent = await createSingleAgent(agentDef, user.id);
    results.push(agent);
  }

  return NextResponse.json(results.length === 1 ? results[0] : results);
}
