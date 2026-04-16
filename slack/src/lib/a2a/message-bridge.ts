import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendA2AMessage } from "./client";
import { executeTool } from "@/lib/mcp/executor";
import { MCP_SERVERS } from "@/lib/mcp/registry";

const VLLM_BASE_URL = process.env.VLLM_URL || "http://localhost:8100";
const VLLM_MODEL = process.env.VLLM_MODEL || "gemma-4-31B-it";
const MAX_TOOL_ROUNDS = 5;

interface SkillDef {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

interface BuiltAgentCard {
  url?: string;
  systemPrompt?: string;
  mcpAccess?: string[];
  skills?: SkillDef[];
  builtBy?: string;
}

interface MessagePointer {
  channelId?: string;
  conversationId?: string;
  messageId?: string;
  senderName?: string;
  agentId?: string;
  fileUrls?: string[];
}

export async function sendToAgent(params: {
  agentId: string;
  text: string;
  channelId?: string;
  conversationId?: string;
  skillId?: string;
  messageId?: string;
  senderName?: string;
  fileUrls?: string[];
}) {
  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.agentId))
    .limit(1);

  if (!agent) throw new Error("Agent not found");

  const agentName = agent.displayName;
  const card = agent.agentCardJson as BuiltAgentCard | null;

  const pointer: MessagePointer = {
    channelId: params.channelId,
    conversationId: params.conversationId,
    messageId: params.messageId,
    senderName: params.senderName,
    agentId: params.agentId,
    fileUrls: params.fileUrls,
  };

  let content: string;
  let metadata: Record<string, unknown>;

  // Built agent → always LLM with tool-use loop
  if (!agent.a2aUrl && card?.builtBy) {
    try {
      content = await runAgent(card, params.text, agentName, pointer, params.skillId);
      metadata = { agentName, provider: "vllm" };
    } catch (err) {
      content = `I'm having trouble responding right now. (${err instanceof Error ? err.message : "Unknown error"})`;
      metadata = { agentName, provider: "vllm", error: true };
    }
  }
  // External A2A agent → SDK client
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
 * Run a built agent: build system prompt → LLM tool-use loop → response.
 * Skills are hints, MCP tools are the actual capabilities.
 * The LLM decides which tools to call and how.
 */
async function runAgent(
  card: BuiltAgentCard,
  userMessage: string,
  agentName: string,
  pointer: MessagePointer,
  skillHint?: string
): Promise<string> {
  // ── Build system prompt ──

  const systemParts: string[] = [];

  // 1. Agent identity
  if (card.systemPrompt) {
    systemParts.push(card.systemPrompt);
  } else {
    systemParts.push(`You are ${agentName}, a helpful assistant.`);
  }

  // 2. Available MCP tools (from mcpAccess)
  const toolDocs: string[] = [];
  for (const serverId of card.mcpAccess || []) {
    const server = MCP_SERVERS.find((s) => s.id === serverId);
    if (!server) continue;
    for (const tool of server.tools) {
      const paramDoc = tool.parameters
        ? Object.entries(tool.parameters)
            .map(([k, v]) => `${k}${v.required ? "*" : ""}:${v.type} (${v.description})`)
            .join(", ")
        : "";
      toolDocs.push(`${serverId}:${tool.name} — ${tool.description}${paramDoc ? ` [${paramDoc}]` : ""}`);
    }
  }

  if (toolDocs.length > 0) {
    systemParts.push(
      `## Available Tools\n\n${toolDocs.join("\n")}\n\n` +
        `To call a tool, write on its own line:\n` +
        `[TOOL_CALL: <tool> | param1=value1, param2=value2]\n\n` +
        `Examples:\n` +
        `[TOOL_CALL: slack:read_thread | conversationId=${pointer.conversationId || "..."}, limit=10]\n` +
        `[TOOL_CALL: polymarket:search | query=bitcoin]\n` +
        `[TOOL_CALL: news:search | query=AI regulations]\n` +
        `[TOOL_CALL: slack:memory_write | agentId=${pointer.agentId || "..."}, key=user_preference, value=likes crypto]\n` +
        `[TOOL_CALL: slack:memory_read | agentId=${pointer.agentId || "..."}]\n\n` +
        `You can call multiple tools across rounds. After receiving tool results, use them to give a thoughtful answer.`
    );
  }

  // 3. Agent skills (high-level abilities)
  if (card.skills?.length) {
    const skillDoc = card.skills
      .map((s) => `- **${s.name}** (${s.id}): ${s.description}${s.instruction ? `\n  Guide: ${s.instruction}` : ""}`)
      .join("\n");
    systemParts.push(`## Your Skills\n\n${skillDoc}`);
  }

  // 4. Message context pointer
  const pointerParts: string[] = [];
  if (pointer.channelId) pointerParts.push(`channelId: ${pointer.channelId}`);
  if (pointer.conversationId) pointerParts.push(`conversationId: ${pointer.conversationId}`);
  if (pointer.messageId) pointerParts.push(`messageId: ${pointer.messageId}`);
  if (pointer.senderName) pointerParts.push(`sender: ${pointer.senderName}`);
  if (pointer.agentId) pointerParts.push(`your agentId: ${pointer.agentId}`);
  if (pointer.fileUrls?.length) {
    pointerParts.push(`attached files:\n${pointer.fileUrls.map((u, i) => `  ${i + 1}. ${u}`).join("\n")}`);
  }

  if (pointerParts.length > 0) {
    const contextNotes = [
      `Use slack:read_thread to read previous messages if you need conversation context.`,
      `Use slack:memory_read to recall what you've learned from past conversations.`,
      `Use slack:memory_write to remember important facts for future conversations.`,
    ];
    if (pointer.fileUrls?.length) {
      contextNotes.push(
        `Files are attached. Use document:convert with the file URL to read the content as Markdown.`,
        `Use document:search to find specific content in the document.`,
        `Use document:metadata to get document structure (title, sections, page count).`
      );
    }
    systemParts.push(
      `## Current Context\n\n${pointerParts.join("\n")}\n\n${contextNotes.join("\n")}`
    );
  }

  // 5. Skill hint — if user invoked a specific skill
  let userContent = userMessage;
  if (skillHint) {
    const skill = card.skills?.find((s) => s.id === skillHint);
    if (skill) {
      userContent = `[Skill requested: ${skill.name}]\n${skill.instruction ? `Guide: ${skill.instruction}\n` : ""}User message: ${userMessage}`;
    }
  }

  // ── Tool-use loop ──

  const llmMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemParts.join("\n\n") },
    { role: "user", content: userContent },
  ];

  let response = await callLLM(llmMessages);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Parse all tool calls from the response
    const toolCalls = parseToolCalls(response);
    if (toolCalls.length === 0) break;

    // Execute all tool calls
    const results: string[] = [];
    for (const tc of toolCalls) {
      // Auto-inject pointer params for slack tools
      if (tc.tool.startsWith("slack:")) {
        if (pointer.channelId && !tc.params.channelId) tc.params.channelId = pointer.channelId;
        if (pointer.conversationId && !tc.params.conversationId) tc.params.conversationId = pointer.conversationId;
        if (pointer.messageId && !tc.params.messageId) tc.params.messageId = pointer.messageId;
        if (pointer.agentId && !tc.params.agentId) tc.params.agentId = pointer.agentId;
      }

      const [serverId, toolName] = tc.tool.split(":");
      if (serverId && toolName) {
        const result = await executeTool(serverId, toolName, tc.params);
        results.push(`[TOOL_RESULT: ${tc.tool}]\n${result.content}\n[/TOOL_RESULT]`);
      }
    }

    // Feed results back
    llmMessages.push({ role: "assistant", content: response });
    llmMessages.push({
      role: "user",
      content: results.join("\n\n") + "\n\nUse the tool results above to answer. Do not output [TOOL_CALL] again unless you need more data.",
    });

    response = await callLLM(llmMessages);
  }

  // Clean artifacts
  return response.replace(/\[TOOL_CALL:[^\]]*\]/g, "").trim();
}

/**
 * Parse [TOOL_CALL: tool | param1=val1, param2=val2] patterns from LLM output.
 */
function parseToolCalls(
  text: string
): Array<{ tool: string; params: Record<string, string> }> {
  const calls: Array<{ tool: string; params: Record<string, string> }> = [];
  const regex = /\[TOOL_CALL:\s*([^\]|]+?)(?:\s*\|\s*([^\]]*))?\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const tool = match[1].trim();
    const paramsStr = match[2]?.trim() || "";
    const params: Record<string, string> = {};

    if (paramsStr) {
      // Parse "key=value, key=value" or just "value" (as query)
      if (paramsStr.includes("=")) {
        for (const pair of paramsStr.split(/,\s*/)) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx > 0) {
            params[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
          }
        }
      } else {
        params.query = paramsStr;
      }
    }

    calls.push({ tool, params });
  }

  return calls;
}

async function callLLM(
  llmMessages: Array<{ role: string; content: string }>
): Promise<string> {
  const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages: llmMessages,
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

// ─── Streaming ─────────────────────────────────────────────

/**
 * Stream a built agent's response. Yields SSE-compatible chunks.
 * Tool-use rounds are non-streaming (tool calls need full text),
 * but the final response is streamed token-by-token.
 */
export async function* streamAgentResponse(params: {
  agentId: string;
  text: string;
  channelId?: string;
  conversationId?: string;
  skillId?: string;
  senderName?: string;
}): AsyncGenerator<{ type: string; content: string }> {
  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.agentId))
    .limit(1);

  if (!agent) {
    yield { type: "error", content: "Agent not found" };
    return;
  }

  const card = agent.agentCardJson as BuiltAgentCard | null;
  const agentName = agent.displayName;

  // External A2A — delegate to SDK streaming
  if (agent.a2aUrl) {
    const { streamA2AMessage } = await import("./client");
    const rpcUrl = (card as { url?: string } | null)?.url || agent.a2aUrl;
    try {
      for await (const event of streamA2AMessage(rpcUrl, params.text, {
        agentName,
        skillId: params.skillId,
      })) {
        yield event;
      }
    } catch {
      yield { type: "error", content: "Stream failed" };
    }
    return;
  }

  // Built agent — vLLM streaming with tool-use
  if (!card?.builtBy) {
    yield { type: "error", content: "Agent not configured" };
    return;
  }

  const pointer: MessagePointer = {
    channelId: params.channelId,
    conversationId: params.conversationId,
    agentId: params.agentId,
    senderName: params.senderName,
  };

  // Build system prompt (same as runAgent)
  const systemContent = buildSystemPrompt(card, agentName, pointer, params.skillId);

  const llmMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemContent },
    { role: "user", content: params.text },
  ];

  // Tool-use rounds (non-streaming — need full text to parse tool calls)
  yield { type: "status", content: "Thinking..." };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callLLM(llmMessages);
    const toolCalls = parseToolCalls(response);

    if (toolCalls.length === 0) {
      // No tool calls in first response — re-do with streaming
      // But we already have the full response, so just yield it
      for (const char of response.replace(/\[TOOL_CALL:[^\]]*\]/g, "")) {
        // Yield in small chunks for smoother streaming feel
        yield { type: "content", content: char };
        // Small artificial delay removed — just chunk it
      }

      // Save to DB
      await db.insert(messages).values({
        channelId: params.channelId || null,
        conversationId: params.conversationId || null,
        userId: agent.id,
        content: response.replace(/\[TOOL_CALL:[^\]]*\]/g, "").trim(),
        contentType: "agent-response",
        metadata: { agentName, provider: "vllm" },
      });
      return;
    }

    // Execute tools
    yield { type: "status", content: `Calling ${toolCalls.map(t => t.tool).join(", ")}...` };

    const results: string[] = [];
    for (const tc of toolCalls) {
      if (tc.tool.startsWith("slack:")) {
        if (pointer.channelId && !tc.params.channelId) tc.params.channelId = pointer.channelId;
        if (pointer.conversationId && !tc.params.conversationId) tc.params.conversationId = pointer.conversationId;
        if (pointer.agentId && !tc.params.agentId) tc.params.agentId = pointer.agentId;
      }
      const [serverId, toolName] = tc.tool.split(":");
      if (serverId && toolName) {
        const result = await executeTool(serverId, toolName, tc.params);
        results.push(`[TOOL_RESULT: ${tc.tool}]\n${result.content}\n[/TOOL_RESULT]`);
      }
    }

    llmMessages.push({ role: "assistant", content: response });
    llmMessages.push({
      role: "user",
      content: results.join("\n\n") + "\n\nUse the tool results above to answer. Do not output [TOOL_CALL] again unless you need more data.",
    });
  }

  // Final streaming response from vLLM
  yield { type: "status", content: "Generating response..." };

  let fullContent = "";
  try {
    const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: llmMessages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const fallback = await callLLM(llmMessages);
      yield { type: "content", content: fallback };
      fullContent = fallback;
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                yield { type: "content", content: delta };
              }
            } catch { /* skip */ }
          }
        }
      }
    }
  } catch {
    const fallback = await callLLM(llmMessages);
    yield { type: "content", content: fallback };
    fullContent = fallback;
  }

  // Save final message to DB
  const cleanContent = fullContent.replace(/\[TOOL_CALL:[^\]]*\]/g, "").trim();
  if (cleanContent) {
    await db.insert(messages).values({
      channelId: params.channelId || null,
      conversationId: params.conversationId || null,
      userId: agent.id,
      content: cleanContent,
      contentType: "agent-response",
      metadata: { agentName, provider: "vllm" },
    });
  }
}

/**
 * Build the system prompt for a built agent (shared between streaming and non-streaming).
 */
function buildSystemPrompt(
  card: BuiltAgentCard,
  agentName: string,
  pointer: MessagePointer,
  skillHint?: string
): string {
  const systemParts: string[] = [];

  if (card.systemPrompt) {
    systemParts.push(card.systemPrompt);
  } else {
    systemParts.push(`You are ${agentName}, a helpful assistant.`);
  }

  // Available tools
  const toolDocs: string[] = [];
  for (const serverId of card.mcpAccess || []) {
    const server = MCP_SERVERS.find((s) => s.id === serverId);
    if (!server) continue;
    for (const tool of server.tools) {
      const paramDoc = tool.parameters
        ? Object.entries(tool.parameters)
            .map(([k, v]) => `${k}${v.required ? "*" : ""}:${v.type} (${v.description})`)
            .join(", ")
        : "";
      toolDocs.push(`${serverId}:${tool.name} — ${tool.description}${paramDoc ? ` [${paramDoc}]` : ""}`);
    }
  }

  if (toolDocs.length > 0) {
    systemParts.push(
      `## Available Tools\n\n${toolDocs.join("\n")}\n\n` +
        `To call a tool, write on its own line:\n[TOOL_CALL: <tool> | param1=value1, param2=value2]\n\n` +
        `Examples:\n` +
        `[TOOL_CALL: slack:read_thread | conversationId=${pointer.conversationId || "..."}, limit=10]\n` +
        `[TOOL_CALL: slack:memory_read | agentId=${pointer.agentId || "..."}]\n` +
        `[TOOL_CALL: slack:agent_create | name=MyBot, creatorId=${pointer.agentId || "..."}]\n\n` +
        `You can call multiple tools across rounds. After receiving tool results, answer thoughtfully.`
    );
  }

  // Skills
  if (card.skills?.length) {
    const skillDoc = card.skills
      .map((s) => `- **${s.name}** (${s.id}): ${s.description}${s.instruction ? `\n  Guide: ${s.instruction}` : ""}`)
      .join("\n");
    systemParts.push(`## Your Skills\n\n${skillDoc}`);
  }

  // Pointer context
  const pointerParts: string[] = [];
  if (pointer.channelId) pointerParts.push(`channelId: ${pointer.channelId}`);
  if (pointer.conversationId) pointerParts.push(`conversationId: ${pointer.conversationId}`);
  if (pointer.messageId) pointerParts.push(`messageId: ${pointer.messageId}`);
  if (pointer.senderName) pointerParts.push(`sender: ${pointer.senderName}`);
  if (pointer.agentId) pointerParts.push(`your agentId: ${pointer.agentId}`);

  if (pointerParts.length > 0) {
    systemParts.push(
      `## Current Context\n\n${pointerParts.join("\n")}\n` +
        `Use slack:read_thread to read previous messages. Use slack:memory_read/write for persistent memory.`
    );
  }

  // Skill hint
  if (skillHint) {
    const skill = card.skills?.find((s) => s.id === skillHint);
    if (skill) {
      systemParts.push(`## Active Skill: ${skill.name}\n${skill.instruction || skill.description}`);
    }
  }

  return systemParts.join("\n\n");
}
