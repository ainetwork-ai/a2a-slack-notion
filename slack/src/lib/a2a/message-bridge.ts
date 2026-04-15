import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendA2AMessage } from "./client";
import { executeTool } from "@/lib/mcp/executor";

const VLLM_BASE_URL = process.env.VLLM_URL || "http://localhost:8100";
const VLLM_MODEL = process.env.VLLM_MODEL || "gemma-4-31B-it";

interface AgentCard {
  url?: string;
  systemPrompt?: string;
  mcpServerIds?: string[];
  builtBy?: string;
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
  const card = agent.agentCardJson as AgentCard | null;

  let content: string;
  let metadata: Record<string, unknown>;

  // Built agent (no a2aUrl) → use local vLLM
  if (!agent.a2aUrl && card?.builtBy) {
    try {
      content = await callBuiltAgent(card, params.text, agentName);
      metadata = { agentName, provider: "vllm" };
    } catch (err) {
      content = `I'm having trouble responding right now. (${err instanceof Error ? err.message : "Unknown error"})`;
      metadata = { agentName, provider: "vllm", error: true };
    }
  }
  // External A2A agent
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

async function callBuiltAgent(
  card: AgentCard,
  userMessage: string,
  agentName: string
): Promise<string> {
  const systemParts: string[] = [];

  if (card.systemPrompt) {
    systemParts.push(card.systemPrompt);
  } else {
    systemParts.push(`You are ${agentName}, a helpful assistant.`);
  }

  // If agent has MCP tools, gather context
  let mcpContext = "";
  if (card.mcpServerIds?.length) {
    // Check if user is asking about markets/news and auto-fetch
    const lowerMsg = userMessage.toLowerCase();
    for (const serverId of card.mcpServerIds) {
      if (serverId === "polymarket" && /market|predict|bet|odds|polymarket|election|trump|bitcoin/i.test(lowerMsg)) {
        const result = await executeTool("polymarket", "search", { query: userMessage, limit: 3 });
        if (result.success) mcpContext += `\n\n[Polymarket Data]\n${result.content}`;
      }
      if (serverId === "news" && /news|latest|recent|today|happening|이재명|뉴스|소식/i.test(lowerMsg)) {
        const result = await executeTool("news", "search", { query: userMessage, limit: 3 });
        if (result.success) mcpContext += `\n\n[News Data]\n${result.content}`;
      }
    }

    if (mcpContext) {
      systemParts.push(
        "You have access to real-time data. Use the following data to inform your response:" + mcpContext
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
