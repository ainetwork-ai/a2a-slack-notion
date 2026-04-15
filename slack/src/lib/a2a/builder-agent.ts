/**
 * Builder agent — intercepts DM messages and creates agents via natural conversation.
 * No external LLM needed: uses regex/keyword matching to parse intent.
 */

import { db } from "@/lib/db";
import { users, workspaceMembers, channels, channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ─── Agent templates ──────────────────────────────────────────────────────────

interface AgentTemplate {
  description: string;
  systemPrompt: string;
  mcpAccess: string[];
}

const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  researcher: {
    description: "Researches and collects information on any topic",
    systemPrompt:
      "You are a research assistant. Your job is to gather, synthesize, and present accurate information on the topics you are asked about. " +
      "Always cite your sources when possible, provide balanced perspectives, and be thorough yet concise. " +
      "When researching, use available tools to search for current information before answering.",
    mcpAccess: ["slack", "news"],
  },
  writer: {
    description: "Writes articles, reports, and creative content",
    systemPrompt:
      "You are a professional writer. Your job is to craft compelling, well-structured content including articles, reports, summaries, and creative pieces. " +
      "Adapt your tone and style to the audience and purpose. Always ensure clarity, coherence, and engagement in your writing.",
    mcpAccess: ["slack"],
  },
  editor: {
    description: "Reviews and edits content for quality and clarity",
    systemPrompt:
      "You are an editor. Your job is to review and improve written content. " +
      "Check for clarity, grammar, structure, tone, and factual accuracy. " +
      "Provide constructive feedback and suggest specific improvements. " +
      "When editing, explain your changes so writers can learn.",
    mcpAccess: ["slack"],
  },
  analyst: {
    description: "Analyzes data, trends, and provides insights",
    systemPrompt:
      "You are a data analyst. Your job is to examine information, identify patterns, and provide actionable insights. " +
      "Break down complex data into clear findings. Support conclusions with evidence. " +
      "Present analysis in structured formats like summaries, bullet points, or tables when appropriate.",
    mcpAccess: ["slack", "news"],
  },
  translator: {
    description: "Translates content between languages",
    systemPrompt:
      "You are a professional translator. Your job is to accurately translate content between languages while preserving meaning, tone, and context. " +
      "Be aware of cultural nuances and idiomatic expressions. " +
      "When unsure about a translation, provide the most natural option and note any ambiguity.",
    mcpAccess: ["slack"],
  },
  assistant: {
    description: "General-purpose helpful assistant",
    systemPrompt:
      "You are a helpful assistant. Your job is to assist with a wide range of tasks including answering questions, helping with planning, " +
      "summarizing information, and providing recommendations. Be clear, concise, and friendly.",
    mcpAccess: ["slack"],
  },
  monitor: {
    description: "Monitors news and alerts on specific topics",
    systemPrompt:
      "You are a monitoring agent. Your job is to track news and updates on specific topics and alert users to important developments. " +
      "Provide concise summaries of the latest information and highlight the most significant events or changes.",
    mcpAccess: ["slack", "news"],
  },
  scheduler: {
    description: "Manages schedules and reminders",
    systemPrompt:
      "You are a scheduling assistant. Your job is to help users manage their time, set reminders, and organize tasks. " +
      "Be proactive about suggesting optimal timing and help prioritize tasks effectively.",
    mcpAccess: ["slack"],
  },
};

// ─── Creation keywords ────────────────────────────────────────────────────────

const CREATION_KEYWORDS =
  /\b(만들어|생성|create|build|make|추가|add|spawn|새로운|new)\b/i;

const CHANNEL_KEYWORDS =
  /\b(채널|channel)\b/i;

// ─── Name extraction ──────────────────────────────────────────────────────────

/**
 * Extract agent names and descriptions from a message.
 * Handles patterns like:
 *   "뉴스 리서처 에이전트 만들어줘"
 *   "Create a NewsWriter agent that writes articles"
 *   "리서처랑 라이터 두 개 만들어줘"
 *   "make me a news researcher and a content writer"
 */
function extractAgentRequests(message: string): Array<{ name: string; role: string; description: string }> {
  const results: Array<{ name: string; role: string; description: string }> = [];

  // Normalize
  const text = message.trim();

  // Pattern 1: "NAME agent/에이전트 [that/which/who description]"
  const agentPattern =
    /([A-Za-z가-힣][A-Za-z가-힣\s\-_]*?)\s+(?:agent|에이전트|봇|bot)(?:\s+(?:that|which|who|for|to)\s+(.+?))?(?:[,\n]|$)/gi;

  let m: RegExpExecArray | null;
  while ((m = agentPattern.exec(text)) !== null) {
    const rawName = m[1].trim();
    const desc = m[2]?.trim() || "";
    if (rawName.length < 2) continue;
    const role = detectRole(rawName + " " + desc);
    results.push({
      name: formatAgentName(rawName),
      role,
      description: desc || AGENT_TEMPLATES[role]?.description || `${rawName} agent`,
    });
  }

  // Pattern 2: Korean compound — "뉴스 리서처", "콘텐츠 라이터" etc.
  if (results.length === 0) {
    const koreanPattern = /([가-힣A-Za-z]+(?:\s+[가-힣A-Za-z]+)?)\s+(?:에이전트|봇)/g;
    while ((m = koreanPattern.exec(text)) !== null) {
      const rawName = m[1].trim();
      if (rawName.length < 2) continue;
      const role = detectRole(rawName);
      results.push({
        name: formatAgentName(rawName),
        role,
        description: AGENT_TEMPLATES[role]?.description || `${rawName} agent`,
      });
    }
  }

  // Pattern 3: "a/an ROLE" or "ROLE agent" without explicit word "agent"
  // e.g. "make me a researcher" / "make me a news researcher and a writer"
  if (results.length === 0) {
    const roleWords = Object.keys(AGENT_TEMPLATES).join("|");
    const rolePattern = new RegExp(
      `(?:a|an|하나)\\s+(?:[A-Za-z가-힣]+\\s+)?(${roleWords})`,
      "gi"
    );
    while ((m = rolePattern.exec(text)) !== null) {
      const role = m[1].toLowerCase();
      // Look for a qualifier before the role in the same match area
      const beforeRole = text.slice(Math.max(0, m.index - 20), m.index + m[0].length);
      const qualifier = extractQualifier(beforeRole, role);
      const name = qualifier ? formatAgentName(`${qualifier} ${role}`) : formatAgentName(role);
      results.push({
        name,
        role,
        description: AGENT_TEMPLATES[role]?.description || `${name} agent`,
      });
    }
  }

  // Pattern 4: multiple roles joined by "and/랑/과/와/,"
  // e.g. "리서처랑 라이터 두 개", "researcher and writer"
  if (results.length === 0) {
    const multiRole = /([A-Za-z가-힣]+)(?:\s*(?:랑|과|와|and|,)\s*([A-Za-z가-힣]+))+/gi;
    while ((m = multiRole.exec(text)) !== null) {
      const parts = m[0].split(/\s*(?:랑|과|와|and|,)\s*/i).map((p) => p.trim());
      for (const part of parts) {
        const role = detectRole(part);
        if (role !== "assistant") {
          results.push({
            name: formatAgentName(part),
            role,
            description: AGENT_TEMPLATES[role]?.description || `${part} agent`,
          });
        }
      }
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Extract a qualifier word preceding the role keyword (e.g. "news" from "news researcher") */
function extractQualifier(context: string, role: string): string {
  const idx = context.toLowerCase().lastIndexOf(role);
  if (idx <= 0) return "";
  const before = context.slice(0, idx).trim();
  const words = before.split(/\s+/);
  const last = words[words.length - 1];
  if (last && !/^(a|an|the|make|create|build|me|a|하나|봇)$/i.test(last)) {
    return last;
  }
  return "";
}

/** Detect the best-matching role from a text snippet */
function detectRole(text: string): string {
  const lower = text.toLowerCase();

  const aliases: Record<string, string> = {
    research: "researcher",
    리서처: "researcher",
    리서치: "researcher",
    조사: "researcher",
    검색: "researcher",
    뉴스: "researcher",
    writer: "writer",
    라이터: "writer",
    작가: "writer",
    작성: "writer",
    editor: "editor",
    에디터: "editor",
    편집: "editor",
    검토: "editor",
    analyst: "analyst",
    분석: "analyst",
    분석가: "analyst",
    translator: "translator",
    번역: "translator",
    번역가: "translator",
    monitor: "monitor",
    모니터: "monitor",
    알림: "monitor",
    scheduler: "scheduler",
    스케줄: "scheduler",
    일정: "scheduler",
    assistant: "assistant",
    어시스턴트: "assistant",
    도우미: "assistant",
  };

  for (const [keyword, role] of Object.entries(aliases)) {
    if (lower.includes(keyword)) return role;
  }

  // Check template keys directly
  for (const key of Object.keys(AGENT_TEMPLATES)) {
    if (lower.includes(key)) return key;
  }

  return "assistant";
}

/** Convert raw name to PascalCase agent name */
function formatAgentName(raw: string): string {
  return raw
    .split(/[\s\-_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// ─── Channel extraction ───────────────────────────────────────────────────────

interface ChannelRequest {
  name: string;
  inviteAgents: boolean;
}

function extractChannelRequest(message: string): ChannelRequest | null {
  if (!CHANNEL_KEYWORDS.test(message)) return null;

  // Pattern: "NAME 채널" or "channel NAME" or "NAME channel"
  const patterns = [
    /([A-Za-z가-힣][A-Za-z가-힣\s\-_]+?)\s+채널/i,
    /channel\s+([A-Za-z가-힣][A-Za-z가-힣\s\-_]+)/i,
    /([A-Za-z가-힣][A-Za-z가-힣\s\-_]+?)\s+channel/i,
  ];

  for (const pat of patterns) {
    const m = pat.exec(message);
    if (m) {
      const name = m[1].trim().toLowerCase().replace(/\s+/g, "-");
      const inviteAgents = /초대|invite|join|들어|넣어/.test(message);
      return { name, inviteAgents };
    }
  }

  return null;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

export interface BuilderResult {
  response: string;
  createdAgents: Array<{ id: string; name: string; a2aUrl: string | null }>;
  createdChannel: { id: string; name: string } | null;
}

/**
 * Main entry point: parse a message and take builder actions.
 * Returns a human-readable response and any created resources.
 */
export async function handleBuilderMessage(
  message: string,
  userId: string
): Promise<BuilderResult> {
  const isCreationIntent = CREATION_KEYWORDS.test(message);

  if (!isCreationIntent) {
    return {
      response: buildHelpMessage(),
      createdAgents: [],
      createdChannel: null,
    };
  }

  const agentRequests = extractAgentRequests(message);
  const channelRequest = extractChannelRequest(message);

  // Nothing detected
  if (agentRequests.length === 0 && !channelRequest) {
    return {
      response:
        "I detected a creation intent but couldn't figure out what to build. " +
        "Try something like:\n" +
        "• \"Create a NewsResearcher agent\"\n" +
        "• \"Make me a writer and an editor agent\"\n" +
        "• \"뉴스 리서처 에이전트 만들어줘\"\n" +
        "• \"Create a newsroom channel\"",
      createdAgents: [],
      createdChannel: null,
    };
  }

  const createdAgents: Array<{ id: string; name: string; a2aUrl: string | null }> = [];
  const lines: string[] = [];

  // Create agents
  for (const req of agentRequests) {
    try {
      const agent = await createAgent(req, userId);
      createdAgents.push({ id: agent.id, name: agent.displayName, a2aUrl: agent.a2aUrl });
      lines.push(`✓ **${agent.displayName}** — ${req.description}`);
    } catch (err) {
      lines.push(`✗ Failed to create ${req.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // Create channel
  let createdChannel: { id: string; name: string } | null = null;
  if (channelRequest) {
    try {
      createdChannel = await createChannel(channelRequest, userId, createdAgents);
      lines.push(`✓ Channel **#${createdChannel.name}** created`);
      if (channelRequest.inviteAgents && createdAgents.length > 0) {
        lines.push(`  Invited: ${createdAgents.map((a) => a.name).join(", ")}`);
      }
    } catch (err) {
      lines.push(`✗ Failed to create channel: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const summary =
    createdAgents.length > 0
      ? `I've created ${createdAgents.length} agent${createdAgents.length > 1 ? "s" : ""} for you:`
      : "Here's what I did:";

  return {
    response: `${summary}\n\n${lines.join("\n")}`,
    createdAgents,
    createdChannel,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function createAgent(
  req: { name: string; role: string; description: string },
  userId: string
): Promise<{ id: string; displayName: string; a2aUrl: string | null }> {
  const template = AGENT_TEMPLATES[req.role] || AGENT_TEMPLATES.assistant;

  const ainAddress = `agent-${req.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  const agentCard = {
    name: req.name,
    description: req.description,
    systemPrompt: template.systemPrompt,
    mcpAccess: template.mcpAccess,
    skills: [],
    builtBy: userId,
    provider: { organization: "Slack-A2A" },
    version: "2.0.0",
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      extensions: [
        { uri: "urn:a2a:ext:memory", description: "Persistent agent memory across conversations", required: false },
        { uri: "urn:a2a:ext:tool-use", description: "LLM-driven MCP tool invocation", required: false },
      ],
    },
  };

  const [agent] = await db
    .insert(users)
    .values({
      ainAddress,
      displayName: req.name,
      isAgent: true,
      status: "online",
      agentCardJson: agentCard,
    })
    .returning();

  // Register with a2a-builder (best-effort)
  let a2aUrl: string | null = null;
  try {
    const builderRes = await fetch("https://a2a-builder.ainetwork.ai/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: req.name,
        description: req.description,
        systemPrompt: template.systemPrompt,
        skills: [],
      }),
    });
    if (builderRes.ok) {
      const data = await builderRes.json();
      a2aUrl =
        data.url ||
        data.a2aUrl ||
        `https://a2a-builder.ainetwork.ai/api/agents/${data.id || data.agentId}`;
      await db
        .update(users)
        .set({ a2aUrl, agentCardJson: { ...agentCard, url: a2aUrl } })
        .where(eq(users.id, agent.id));
    }
  } catch {
    // Agent still works locally without A2A URL
  }

  // Add to creator's workspaces and their public channels
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
      .where(and(eq(channels.workspaceId, ws.workspaceId), eq(channels.isPrivate, false)));

    for (const ch of publicChannels) {
      await db
        .insert(channelMembers)
        .values({ channelId: ch.id, userId: agent.id, role: "member" })
        .onConflictDoNothing();
    }
  }

  return { id: agent.id, displayName: agent.displayName, a2aUrl };
}

async function createChannel(
  req: ChannelRequest,
  userId: string,
  agentsToInvite: Array<{ id: string; name: string; a2aUrl: string | null }>
): Promise<{ id: string; name: string }> {
  // Determine workspace from user
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  const workspaceId = membership?.workspaceId || null;

  const [channel] = await db
    .insert(channels)
    .values({
      name: req.name,
      isPrivate: false,
      createdBy: userId,
      workspaceId,
    })
    .returning();

  // Add creator
  await db
    .insert(channelMembers)
    .values({ channelId: channel.id, userId, role: "owner" })
    .onConflictDoNothing();

  // Invite agents if requested
  if (req.inviteAgents && agentsToInvite.length > 0) {
    for (const agent of agentsToInvite) {
      await db
        .insert(channelMembers)
        .values({ channelId: channel.id, userId: agent.id, role: "member" })
        .onConflictDoNothing();
    }
  }

  return { id: channel.id, name: channel.name };
}

function buildHelpMessage(): string {
  return (
    "Hi! I'm the Builder agent. I can create new agents and channels for you.\n\n" +
    "**Create an agent:**\n" +
    "• \"Create a NewsResearcher agent\"\n" +
    "• \"Make me a content writer agent\"\n" +
    "• \"뉴스 리서처 에이전트 만들어줘\"\n" +
    "• \"Build a researcher and a writer agent\"\n\n" +
    "**Create a channel:**\n" +
    "• \"Create a newsroom channel\"\n" +
    "• \"뉴스룸 채널 만들어줘\"\n\n" +
    "**Create agents and channel together:**\n" +
    "• \"Create a researcher and writer agent, then make a newsroom channel and invite them\"\n\n" +
    "**Available agent types:** " +
    Object.entries(AGENT_TEMPLATES)
      .map(([k, v]) => `\`${k}\` (${v.description})`)
      .join(", ")
  );
}
