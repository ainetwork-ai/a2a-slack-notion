// Slack internal MCP provider — exposes workspace data as MCP tools
// Used by agents to fetch conversation context on-demand

import { db } from "@/lib/db";
import { messages, users, channels, channelMembers, agentMemories } from "@/lib/db/schema";
import { eq, and, desc, lt, gt, ilike, sql } from "drizzle-orm";

export async function read_thread(params: {
  channelId?: string;
  conversationId?: string;
  limit?: number;
}): Promise<string> {
  const limit = Math.min(params.limit || 10, 30);

  if (!params.channelId && !params.conversationId) {
    return "Either channelId or conversationId is required.";
  }

  try {
    const where = params.conversationId
      ? eq(messages.conversationId, params.conversationId)
      : eq(messages.channelId, params.channelId!);

    const recent = await db
      .select({
        content: messages.content,
        contentType: messages.contentType,
        createdAt: messages.createdAt,
        displayName: users.displayName,
        isAgent: users.isAgent,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    if (recent.length === 0) return "No messages found in this conversation.";

    const lines = recent.reverse().map((m) => {
      const tag = m.isAgent ? " [Bot]" : "";
      const time = new Date(m.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${time}] ${m.displayName}${tag}: ${m.content}`;
    });

    return `**Recent messages (${lines.length})**\n\n${lines.join("\n")}`;
  } catch (err) {
    return `Failed to read thread: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function get_context(params: {
  messageId: string;
  before?: number;
  after?: number;
}): Promise<string> {
  const beforeCount = Math.min(params.before || 5, 20);
  const afterCount = Math.min(params.after || 5, 20);

  if (!params.messageId) return "messageId is required.";

  try {
    // Get the target message
    const [target] = await db
      .select({
        id: messages.id,
        channelId: messages.channelId,
        conversationId: messages.conversationId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.id, params.messageId))
      .limit(1);

    if (!target) return "Message not found.";

    const scope = target.conversationId
      ? eq(messages.conversationId, target.conversationId)
      : eq(messages.channelId, target.channelId!);

    // Messages before
    const beforeMsgs = await db
      .select({
        content: messages.content,
        createdAt: messages.createdAt,
        displayName: users.displayName,
        isAgent: users.isAgent,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(and(scope, lt(messages.createdAt, target.createdAt)))
      .orderBy(desc(messages.createdAt))
      .limit(beforeCount);

    // Messages after
    const afterMsgs = await db
      .select({
        content: messages.content,
        createdAt: messages.createdAt,
        displayName: users.displayName,
        isAgent: users.isAgent,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(and(scope, gt(messages.createdAt, target.createdAt)))
      .orderBy(messages.createdAt)
      .limit(afterCount);

    const all = [...beforeMsgs.reverse(), ...afterMsgs];

    if (all.length === 0) return "No surrounding messages found.";

    const lines = all.map((m) => {
      const tag = m.isAgent ? " [Bot]" : "";
      const time = new Date(m.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${time}] ${m.displayName}${tag}: ${m.content}`;
    });

    return `**Context around message (${lines.length} msgs)**\n\n${lines.join("\n")}`;
  } catch (err) {
    return `Failed to get context: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function search(params: {
  query: string;
  channelId?: string;
  limit?: number;
}): Promise<string> {
  const limit = Math.min(params.limit || 10, 20);

  if (!params.query?.trim()) return "Search query is required.";

  try {
    const conditions = [ilike(messages.content, `%${params.query}%`)];
    if (params.channelId) {
      conditions.push(eq(messages.channelId, params.channelId));
    }

    const results = await db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        displayName: users.displayName,
        channelName: channels.name,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .leftJoin(channels, eq(messages.channelId, channels.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    if (results.length === 0) return `No messages found for "${params.query}".`;

    const lines = results.map((r, i) => {
      const ch = r.channelName ? `#${r.channelName}` : "DM";
      const date = new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const preview =
        r.content.length > 120 ? r.content.slice(0, 120) + "..." : r.content;
      return `**${i + 1}.** ${r.displayName} in ${ch} (${date})\n   ${preview}`;
    });

    return `**Search: "${params.query}" (${results.length} results)**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function channel_info(params: {
  channelId: string;
}): Promise<string> {
  if (!params.channelId) return "channelId is required.";

  try {
    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, params.channelId))
      .limit(1);

    if (!channel) return "Channel not found.";

    const members = await db
      .select({
        displayName: users.displayName,
        role: channelMembers.role,
        isAgent: users.isAgent,
      })
      .from(channelMembers)
      .innerJoin(users, eq(channelMembers.userId, users.id))
      .where(eq(channelMembers.channelId, params.channelId));

    const memberList = members
      .map((m) => `${m.displayName}${m.isAgent ? " [Bot]" : ""} (${m.role})`)
      .join(", ");

    return `**#${channel.name}**\n${channel.description || "No description"}\nMembers (${members.length}): ${memberList}\nCreated: ${new Date(channel.createdAt).toLocaleDateString()}`;
  } catch (err) {
    return `Failed to get channel info: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ─── Agent Memory ──────────────────────────────────────────

export async function memory_read(params: {
  agentId: string;
  key?: string;
}): Promise<string> {
  if (!params.agentId) return "agentId is required.";
  try {
    if (params.key) {
      const [mem] = await db
        .select()
        .from(agentMemories)
        .where(and(eq(agentMemories.agentId, params.agentId), eq(agentMemories.key, params.key)))
        .limit(1);
      if (!mem) return `No memory found for key "${params.key}".`;
      return `**${mem.key}**: ${mem.value}`;
    }
    const mems = await db
      .select()
      .from(agentMemories)
      .where(eq(agentMemories.agentId, params.agentId))
      .orderBy(desc(agentMemories.updatedAt))
      .limit(50);
    if (mems.length === 0) return "No memories stored.";
    const lines = mems.map((m) => `- **${m.key}**: ${m.value.length > 100 ? m.value.slice(0, 100) + "..." : m.value}`);
    return `**Agent Memory (${mems.length} entries)**\n\n${lines.join("\n")}`;
  } catch (err) {
    return `Failed to read memory: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function memory_write(params: {
  agentId: string;
  key: string;
  value: string;
}): Promise<string> {
  if (!params.agentId || !params.key || !params.value) return "agentId, key, and value are required.";
  try {
    await db
      .insert(agentMemories)
      .values({ agentId: params.agentId, key: params.key, value: params.value })
      .onConflictDoUpdate({
        target: [agentMemories.agentId, agentMemories.key],
        set: { value: params.value, updatedAt: new Date() },
      });
    return `Saved: **${params.key}** = ${params.value}`;
  } catch (err) {
    return `Failed to write memory: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function memory_delete(params: {
  agentId: string;
  key: string;
}): Promise<string> {
  if (!params.agentId || !params.key) return "agentId and key are required.";
  try {
    await db
      .delete(agentMemories)
      .where(and(eq(agentMemories.agentId, params.agentId), eq(agentMemories.key, params.key)));
    return `Deleted memory: **${params.key}**`;
  } catch (err) {
    return `Failed to delete memory: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ─── Agent CRUD ────────────────────────────────────────────

import { workspaceMembers } from "@/lib/db/schema";

export async function agent_create(params: {
  name: string;
  description?: string;
  systemPrompt?: string;
  mcpAccess?: string;
  skills?: string;
  creatorId: string;
}): Promise<string> {
  if (!params.name?.trim()) return "Agent name is required.";
  if (!params.creatorId) return "creatorId is required.";

  try {
    const ainAddress = `agent-${params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

    let parsedSkills: Array<{ name: string; description: string; instruction: string }> = [];
    if (params.skills) {
      try { parsedSkills = JSON.parse(params.skills); } catch { /* ignore */ }
    }

    let mcpAccessList: string[] = ["slack"];
    if (params.mcpAccess) {
      try {
        const parsed = JSON.parse(params.mcpAccess);
        mcpAccessList = Array.from(new Set([...parsed, "slack"]));
      } catch {
        mcpAccessList = [...params.mcpAccess.split(",").map(s => s.trim()), "slack"];
      }
    }

    const agentSkills = parsedSkills.map(s => ({
      id: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: s.name,
      description: s.description || "",
      instruction: s.instruction || "",
    }));

    const agentCard = {
      name: params.name.trim(),
      description: params.description?.trim() || `Agent: ${params.name.trim()}`,
      systemPrompt: params.systemPrompt?.trim() || "",
      mcpAccess: mcpAccessList,
      skills: agentSkills,
      builtBy: params.creatorId,
      provider: { organization: "Slack-A2A" },
      version: "2.0.0",
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
        extensions: [
          { uri: "urn:a2a:ext:memory", description: "Persistent agent memory", required: false },
          { uri: "urn:a2a:ext:tool-use", description: "LLM-driven MCP tool invocation", required: false },
        ],
      },
    };

    const [agent] = await db
      .insert(users)
      .values({
        ainAddress,
        displayName: params.name.trim(),
        isAgent: true,
        status: "online",
        agentCardJson: agentCard,
      })
      .returning();

    // Add to creator's workspaces
    const creatorWs = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, params.creatorId));

    for (const ws of creatorWs) {
      await db.insert(workspaceMembers)
        .values({ workspaceId: ws.workspaceId, userId: agent.id, role: "member" })
        .onConflictDoNothing();

      const pubChannels = await db.select({ id: channels.id }).from(channels)
        .where(and(eq(channels.workspaceId, ws.workspaceId), eq(channels.isPrivate, false)));
      for (const ch of pubChannels) {
        await db.insert(channelMembers)
          .values({ channelId: ch.id, userId: agent.id, role: "member" })
          .onConflictDoNothing();
      }
    }

    const skillNames = agentSkills.map(s => s.name).join(", ") || "General Chat";
    return `**Agent created successfully!**\n\nName: **${agent.displayName}**\nID: \`${agent.id}\`\nSkills: ${skillNames}\nMCP Access: ${mcpAccessList.join(", ")}\n\nThe agent is now available in the sidebar. DM @${agent.displayName} to start chatting.`;
  } catch (err) {
    return `Failed to create agent: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function agent_list(params: {
  creatorId?: string;
}): Promise<string> {
  try {
    const agents = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        agentCardJson: users.agentCardJson,
        status: users.status,
      })
      .from(users)
      .where(eq(users.isAgent, true))
      .orderBy(desc(users.createdAt))
      .limit(20);

    if (agents.length === 0) return "No agents found.";

    const lines = agents.map((a, i) => {
      const card = a.agentCardJson as { builtBy?: string; skills?: Array<{ name: string }>; mcpAccess?: string[] } | null;
      const isOwned = params.creatorId && card?.builtBy === params.creatorId;
      const skills = card?.skills?.map(s => s.name).join(", ") || "—";
      return `**${i + 1}. ${a.displayName}**${isOwned ? " (yours)" : ""}\n   ID: \`${a.id}\` | Skills: ${skills}`;
    });

    return `**Agents (${agents.length})**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Failed to list agents: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}
