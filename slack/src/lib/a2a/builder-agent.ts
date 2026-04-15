/**
 * Builder agent — sends user messages to a2a-builder (LLM) for natural-language
 * intent understanding, then executes the returned JSON actions to create agents
 * and channels. Falls back to simple template matching if the LLM is unavailable.
 */

import { db } from "@/lib/db";
import { users, workspaceMembers, channels, channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ─── Agent templates (used by both LLM path and fallback) ─────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuilderResult {
  response: string;
  createdAgents: Array<{ id: string; name: string; a2aUrl: string | null }>;
  createdChannel: { id: string; name: string } | null;
}

interface LLMAgentDef {
  name: string;
  description?: string;
  role?: string;
  systemPrompt?: string;
}

interface LLMChannelDef {
  channelName: string;
  description?: string;
  inviteAgents?: string[];
  engagementLevels?: Record<string, number>;
}

interface LLMAction {
  action: "create_agents" | "create_channel";
  agents?: LLMAgentDef[];
  channelName?: string;
  description?: string;
  inviteAgents?: string[];
  engagementLevels?: Record<string, number>;
}

// ─── LLM via a2a-builder ──────────────────────────────────────────────────────

const BUILDER_URL = "https://a2a-builder.ainetwork.ai/api/agents";

const SYSTEM_PROMPT = `You are a Builder agent for Slack-A2A. You help users create new AI agents and channels.

When the user asks you to create agents, respond with a JSON block:
\`\`\`json
{"action":"create_agents","agents":[{"name":"AgentName","description":"what it does","role":"researcher|writer|editor|analyst|translator|assistant|monitor|scheduler","systemPrompt":"detailed system prompt for the agent"}]}
\`\`\`

When asked to create a channel and invite agents:
\`\`\`json
{"action":"create_channel","channelName":"channel-name","description":"channel purpose","inviteAgents":["AgentName1","AgentName2"],"engagementLevels":{"AgentName1":2,"AgentName2":1}}
\`\`\`

You can output multiple JSON blocks in sequence — one for creating agents, then one for creating a channel.
Always respond in the same language the user used.
After all JSON blocks, add a friendly confirmation message summarizing what was created.
Agent names should be in PascalCase (e.g. NewsResearcher, ContentWriter).
Channel names should be lowercase with hyphens (e.g. newsroom, ai-research).`;

async function queryLLM(message: string): Promise<string | null> {
  try {
    const res = await fetch(BUILDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: {
          message: {
            messageId: uuidv4(),
            role: "user",
            parts: [{ kind: "text", text: message }],
            kind: "message",
          },
          configuration: {
            blocking: true,
            acceptedOutputModes: ["text/plain"],
          },
          metadata: {
            systemPrompt: SYSTEM_PROMPT,
          },
        },
        id: uuidv4(),
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.result;

    // Task response (artifacts)
    if (result?.artifacts?.[0]?.parts) {
      const textPart = result.artifacts[0].parts.find(
        (p: { kind: string; text?: string }) => p.kind === "text"
      );
      return textPart?.text ?? null;
    }

    // Message response (parts)
    if (result?.parts) {
      const textPart = result.parts.find(
        (p: { kind: string; text?: string }) => p.kind === "text"
      );
      return textPart?.text ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

/** Extract all ```json ... ``` blocks from the LLM response text */
function extractJsonBlocks(text: string): LLMAction[] {
  const actions: LLMAction[] = [];
  const blockRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed?.action) actions.push(parsed as LLMAction);
    } catch {
      // skip malformed blocks
    }
  }
  return actions;
}

/** Extract the human-readable confirmation text (everything after the last ``` block) */
function extractConfirmationText(text: string): string {
  const lastBlock = text.lastIndexOf("```");
  if (lastBlock === -1) return text.trim();
  const after = text.slice(lastBlock + 3).trim();
  return after || text.trim();
}

// ─── Fallback keyword-based intent detection ──────────────────────────────────

const CREATION_KEYWORDS =
  /\b(만들어|생성|create|build|make|추가|add|spawn|새로운|new)\b/i;

const ROLE_ALIASES: Record<string, string> = {
  research: "researcher",
  리서처: "researcher",
  리서치: "researcher",
  조사: "researcher",
  검색: "researcher",
  뉴스: "researcher",
  라이터: "writer",
  작가: "writer",
  작성: "writer",
  에디터: "editor",
  편집: "editor",
  검토: "editor",
  분석: "analyst",
  분석가: "analyst",
  번역: "translator",
  번역가: "translator",
  모니터: "monitor",
  알림: "monitor",
  스케줄: "scheduler",
  일정: "scheduler",
  어시스턴트: "assistant",
  도우미: "assistant",
};

function detectRole(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, role] of Object.entries(ROLE_ALIASES)) {
    if (lower.includes(keyword)) return role;
  }
  for (const key of Object.keys(AGENT_TEMPLATES)) {
    if (lower.includes(key)) return key;
  }
  return "assistant";
}

function fallbackParse(message: string): LLMAction[] {
  if (!CREATION_KEYWORDS.test(message)) return [];

  const actions: LLMAction[] = [];

  // Detect agents via Korean "에이전트" or English "agent" keyword
  const agentRe =
    /([A-Za-z가-힣][A-Za-z가-힣\s\-_]*?)\s+(?:agent|에이전트|봇)/gi;
  const agents: LLMAgentDef[] = [];
  let m: RegExpExecArray | null;
  while ((m = agentRe.exec(message)) !== null) {
    const raw = m[1].trim();
    if (raw.length < 2) continue;
    const role = detectRole(raw);
    const name = raw
      .split(/[\s\-_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
    agents.push({ name, role, description: AGENT_TEMPLATES[role]?.description });
  }

  if (agents.length > 0) {
    actions.push({ action: "create_agents", agents });
  }

  // Detect channel request
  const channelRe =
    /([A-Za-z가-힣][A-Za-z가-힣\s\-_]+?)\s+(?:채널|channel)|(?:channel|채널)\s+([A-Za-z가-힣][A-Za-z가-힣\s\-_]+)/i;
  const cm = channelRe.exec(message);
  if (cm) {
    const raw = (cm[1] || cm[2]).trim().toLowerCase().replace(/\s+/g, "-");
    const inviteAgents =
      /초대|invite|join|들어|넣어/.test(message)
        ? agents.map((a) => a.name)
        : [];
    actions.push({ action: "create_channel", channelName: raw, inviteAgents });
  }

  return actions;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function createAgent(
  def: LLMAgentDef,
  userId: string
): Promise<{ id: string; name: string; a2aUrl: string | null }> {
  const role = def.role || detectRole(def.name);
  const template = AGENT_TEMPLATES[role] || AGENT_TEMPLATES.assistant;

  const systemPrompt = def.systemPrompt || template.systemPrompt;
  const description = def.description || template.description || `${def.name} agent`;

  const ainAddress = `agent-${def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

  const agentCard = {
    name: def.name,
    description,
    systemPrompt,
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
        {
          uri: "urn:a2a:ext:memory",
          description: "Persistent agent memory across conversations",
          required: false,
        },
        {
          uri: "urn:a2a:ext:tool-use",
          description: "LLM-driven MCP tool invocation",
          required: false,
        },
      ],
    },
  };

  const [agent] = await db
    .insert(users)
    .values({
      ainAddress,
      displayName: def.name,
      isAgent: true,
      status: "online",
      agentCardJson: agentCard,
    })
    .returning();

  // Register with a2a-builder (best-effort)
  let a2aUrl: string | null = null;
  try {
    const builderRes = await fetch(BUILDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: def.name,
        description,
        systemPrompt,
        skills: [],
      }),
      signal: AbortSignal.timeout(10000),
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

  // Add agent to creator's workspaces and their public channels
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

  return { id: agent.id, name: agent.displayName, a2aUrl };
}

async function createChannel(
  def: LLMChannelDef,
  userId: string,
  allCreatedAgents: Array<{ id: string; name: string; a2aUrl: string | null }>
): Promise<{ id: string; name: string }> {
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  const workspaceId = membership?.workspaceId ?? null;

  const [channel] = await db
    .insert(channels)
    .values({
      name: def.channelName,
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

  // Invite specified agents (by name) or all created agents if inviteAgents is ["*"]
  if (def.inviteAgents && def.inviteAgents.length > 0) {
    const namesToInvite = new Set(
      def.inviteAgents.map((n) => n.toLowerCase())
    );
    const agentsToInvite =
      def.inviteAgents[0] === "*"
        ? allCreatedAgents
        : allCreatedAgents.filter((a) =>
            namesToInvite.has(a.name.toLowerCase())
          );

    for (const agent of agentsToInvite) {
      await db
        .insert(channelMembers)
        .values({ channelId: channel.id, userId: agent.id, role: "member" })
        .onConflictDoNothing();
    }
  }

  return { id: channel.id, name: channel.name };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Main entry point: sends message to a2a-builder LLM, parses JSON action blocks
 * from the response, and executes agent/channel creation. Falls back to simple
 * keyword parsing if the LLM is unavailable.
 */
export async function handleBuilderMessage(
  message: string,
  userId: string
): Promise<BuilderResult> {
  // 1. Try LLM path
  const llmResponse = await queryLLM(message);

  let actions: LLMAction[];
  let confirmationText: string | null = null;

  if (llmResponse) {
    actions = extractJsonBlocks(llmResponse);
    confirmationText = extractConfirmationText(llmResponse);
  } else {
    // 2. Fallback: simple keyword parsing
    actions = fallbackParse(message);
  }

  // No actions detected → show help
  if (actions.length === 0) {
    return {
      response: buildHelpMessage(),
      createdAgents: [],
      createdChannel: null,
    };
  }

  const createdAgents: Array<{ id: string; name: string; a2aUrl: string | null }> = [];
  const lines: string[] = [];

  // Execute actions in order
  for (const action of actions) {
    if (action.action === "create_agents" && action.agents) {
      for (const agentDef of action.agents) {
        try {
          const agent = await createAgent(agentDef, userId);
          createdAgents.push(agent);
          lines.push(
            `✓ **${agent.name}** — ${agentDef.description || AGENT_TEMPLATES[agentDef.role || "assistant"]?.description || "agent"}`
          );
        } catch (err) {
          lines.push(
            `✗ Failed to create ${agentDef.name}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }
    }

    if (action.action === "create_channel" && action.channelName) {
      try {
        const channel = await createChannel(
          {
            channelName: action.channelName,
            description: action.description,
            inviteAgents: action.inviteAgents ?? [],
            engagementLevels: action.engagementLevels,
          },
          userId,
          createdAgents
        );
        lines.push(`✓ Channel **#${channel.name}** created`);
        if (action.inviteAgents && action.inviteAgents.length > 0) {
          lines.push(
            `  Invited: ${action.inviteAgents.join(", ")}`
          );
        }
      } catch (err) {
        lines.push(
          `✗ Failed to create channel: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }
  }

  // Build final response: use LLM confirmation text if available, else generate one
  let response: string;
  if (confirmationText && confirmationText.length > 10) {
    response = `${lines.join("\n")}\n\n${confirmationText}`;
  } else {
    const summary =
      createdAgents.length > 0
        ? `I've created ${createdAgents.length} agent${createdAgents.length > 1 ? "s" : ""} for you:`
        : "Here's what I did:";
    response = `${summary}\n\n${lines.join("\n")}`;
  }

  return {
    response,
    createdAgents,
    createdChannel: null, // channel returned inline in lines; callers use createdAgents
  };
}

// ─── Help message ─────────────────────────────────────────────────────────────

function buildHelpMessage(): string {
  return (
    "Hi! I'm the Builder agent. I can create new agents and channels for you.\n\n" +
    "**Create an agent:**\n" +
    "• \"Create a NewsResearcher agent\"\n" +
    "• \"Make me a content writer agent\"\n" +
    "• \"뉴스 리서처 에이전트 만들어줘\"\n" +
    "• \"뉴스 리서처 에이전트랑 뉴스 라이터 에이전트 2개 만들어줘\"\n" +
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
