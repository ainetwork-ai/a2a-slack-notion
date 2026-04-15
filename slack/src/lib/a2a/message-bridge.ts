import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendA2AMessage } from "./client";
import type { AgentSkill } from "@a2a-js/sdk";
import { executeTool } from "@/lib/mcp/executor";

const VLLM_BASE_URL = process.env.VLLM_URL || "http://localhost:8100";
const VLLM_MODEL = process.env.VLLM_MODEL || "gemma-4-31B-it";

interface BuiltAgentCard {
  url?: string;
  systemPrompt?: string;
  mcpServerIds?: string[];
  builtBy?: string;
  skills?: AgentSkill[];
}

export async function sendToAgent(params: {
  agentId: string;
  text: string;
  channelId?: string;
  conversationId?: string;
  skillId?: string;
}) {
  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.agentId))
    .limit(1);

  if (!agent) throw new Error("Agent not found");

  const agentName = agent.displayName;
  const card = agent.agentCardJson as BuiltAgentCard | null;

  let content: string;
  let metadata: Record<string, unknown>;

  // Built agent (no a2aUrl) → use local vLLM + skill routing
  if (!agent.a2aUrl && card?.builtBy) {
    try {
      content = await handleBuiltAgent(card, params.text, agentName, params.skillId);
      metadata = { agentName, provider: "vllm" };
    } catch (err) {
      content = `I'm having trouble responding right now. (${err instanceof Error ? err.message : "Unknown error"})`;
      metadata = { agentName, provider: "vllm", error: true };
    }
  }
  // External A2A agent → use SDK client
  else if (agent.a2aUrl) {
    const rpcUrl = card?.url || agent.a2aUrl;
    try {
      const response = await sendA2AMessage(rpcUrl, params.text, {
        agentName,
        skillId: params.skillId,
      });
      content = response.content;
      metadata = {
        a2aTaskId: response.taskId,
        a2aContextId: response.contextId,
        agentName,
      };
    } catch {
      content = "I'm currently unavailable. Please try again later.";
      metadata = { agentName, error: true };
    }
  } else {
    content = "This agent is not configured to respond.";
    metadata = { agentName, error: true };
  }

  const [agentMessage] = await db
    .insert(messages)
    .values({
      channelId: params.channelId || null,
      conversationId: params.conversationId || null,
      userId: agent.id,
      content,
      contentType: "agent-response",
      metadata,
    })
    .returning();

  return agentMessage;
}

/**
 * Handle a built agent message using A2A skill routing + Gemma4 (vLLM).
 *
 * Skill routing:
 *   1. Explicit skillId → execute MCP tool directly
 *   2. Parse message for "<serverId>:<toolName>" or "<serverId> <toolName>" patterns
 *   3. Fallback → Gemma4 with auto-detected MCP context
 */
async function handleBuiltAgent(
  card: BuiltAgentCard,
  userMessage: string,
  agentName: string,
  explicitSkillId?: string
): Promise<string> {
  const skills = card.skills || [];

  // 1. Explicit skillId from @Agent invocation
  if (explicitSkillId) {
    const directResult = await executeSkill(explicitSkillId, userMessage);
    if (directResult) return directResult;
  }

  // 2. Try to match message against skill patterns
  const matchedSkill = matchSkillFromMessage(userMessage, skills);
  if (matchedSkill) {
    const { skillId, remainingArgs } = matchedSkill;
    const directResult = await executeSkill(skillId, remainingArgs || userMessage);
    if (directResult) return directResult;
  }

  // 3. Fallback: Gemma4 with auto-gathered MCP context
  return callGemma4WithContext(card, userMessage, agentName);
}

/**
 * Execute an A2A skill by ID. Skills use format "serverId:toolName".
 */
async function executeSkill(
  skillId: string,
  args: string
): Promise<string | null> {
  // Skills are formatted as "serverId:toolName"
  const [serverId, toolName] = skillId.split(":");
  if (!serverId || !toolName) return null;

  // Parse args for tool parameters
  const params: Record<string, unknown> = {};
  const trimmedArgs = args.trim();
  if (trimmedArgs) {
    // For search-like tools, the args are the query
    params.query = trimmedArgs;
  }

  const result = await executeTool(serverId, toolName, params);
  if (result.success) return result.content;
  return null;
}

/**
 * Match user message against agent skills.
 * Patterns: "polymarket trending", "news search bitcoin", "trending markets"
 */
function matchSkillFromMessage(
  message: string,
  skills: AgentSkill[]
): { skillId: string; remainingArgs: string } | null {
  const lower = message.toLowerCase().trim();

  for (const skill of skills) {
    if (skill.id === "chat") continue; // skip general chat skill

    const [serverId, toolName] = skill.id.split(":");
    if (!serverId || !toolName) continue;

    // Match "<serverId> <toolName> [args]"
    const pattern1 = `${serverId} ${toolName}`;
    if (lower.startsWith(pattern1)) {
      return {
        skillId: skill.id,
        remainingArgs: message.slice(pattern1.length).trim(),
      };
    }

    // Match just "<toolName> [args]" if unambiguous
    if (lower.startsWith(toolName + " ") || lower === toolName) {
      return {
        skillId: skill.id,
        remainingArgs: message.slice(toolName.length).trim(),
      };
    }

    // Match by skill tags
    if (skill.tags?.some((tag) => lower.includes(tag) && tag !== "mcp")) {
      return { skillId: skill.id, remainingArgs: message };
    }
  }

  return null;
}

/**
 * Call Gemma4 via vLLM with auto-detected MCP context.
 */
async function callGemma4WithContext(
  card: BuiltAgentCard,
  userMessage: string,
  agentName: string
): Promise<string> {
  const systemParts: string[] = [];

  if (card.systemPrompt) {
    systemParts.push(card.systemPrompt);
  } else {
    systemParts.push(`You are ${agentName}, a helpful assistant.`);
  }

  // List available skills in system prompt
  if (card.skills?.length) {
    const skillList = card.skills
      .filter((s) => s.id !== "chat")
      .map((s) => `- ${s.id}: ${s.description}`)
      .join("\n");
    if (skillList) {
      systemParts.push(`You have the following skills:\n${skillList}`);
    }
  }

  // Auto-fetch MCP data based on message content
  let mcpContext = "";
  if (card.mcpServerIds?.length) {
    const lowerMsg = userMessage.toLowerCase();
    for (const serverId of card.mcpServerIds) {
      if (
        serverId === "polymarket" &&
        /market|predict|bet|odds|polymarket|election|trump|bitcoin|crypto|price/i.test(lowerMsg)
      ) {
        const result = await executeTool("polymarket", "search", {
          query: userMessage,
          limit: 3,
        });
        if (result.success) mcpContext += `\n\n[Polymarket Data]\n${result.content}`;
      }
      if (
        serverId === "news" &&
        /news|latest|recent|today|happening|뉴스|소식|기사/i.test(lowerMsg)
      ) {
        const result = await executeTool("news", "search", {
          query: userMessage,
          limit: 3,
        });
        if (result.success) mcpContext += `\n\n[News Data]\n${result.content}`;
      }
    }

    if (mcpContext) {
      systemParts.push(
        "You have access to real-time data. Use the following data to inform your response:" +
          mcpContext
      );
    }
  }

  const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages: [
        { role: "system", content: systemParts.join("\n\n") },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`vLLM error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No response generated.";
}
