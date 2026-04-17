import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { sendA2AMessage } from "./client";
import { executeTool } from "@/lib/mcp/executor";
import { MCP_SERVERS } from "@/lib/mcp/registry";

const VLLM_BASE_URL = process.env.VLLM_URL || "http://localhost:8100";
const VLLM_MODEL = process.env.VLLM_MODEL || "gemma-4-31B-it";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const VLLM_CHAT_URL = VLLM_BASE_URL.includes("/chat/completions")
  ? VLLM_BASE_URL
  : `${VLLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`;
const MAX_TOOL_ROUNDS = 5;
const VLLM_CONTEXT_LIMIT = Number(process.env.VLLM_CONTEXT_LIMIT || 32768);
const VLLM_SAFETY_MARGIN = 800;
function llmHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (LLM_API_KEY) h["api-key"] = LLM_API_KEY;
  return h;
}

/**
 * Estimate token count (rough: 1 token ~= 3 chars for mixed English/Korean/code).
 * Conservative — overestimate to avoid context overflow.
 */
function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  const totalChars = messages.reduce((sum, m) => sum + m.role.length + m.content.length + 10, 0);
  return Math.ceil(totalChars / 3);
}

/**
 * Calculate max output tokens that fit in the remaining context window.
 * Returns at least 256 tokens to guarantee useful output.
 */
function computeMaxTokens(messages: Array<{ role: string; content: string }>): number {
  const inputTokens = estimateTokens(messages);
  const available = VLLM_CONTEXT_LIMIT - inputTokens - VLLM_SAFETY_MARGIN;
  return Math.max(256, Math.min(1024, available));
}

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
  variables?: Record<string, string>;
  messageId?: string;
  senderName?: string;
  fileUrls?: string[];
}) {
  // Accept either the users.id UUID or the natural a2aId (e.g. "bitcoinnewsresearcher").
  // Workflows and A2A calls prefer the a2aId so the step config stays human-readable.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    params.agentId
  );
  const [agent] = await db
    .select()
    .from(users)
    .where(
      isUuid
        ? or(eq(users.id, params.agentId), eq(users.a2aId, params.agentId))!
        : eq(users.a2aId, params.agentId)
    )
    .limit(1);

  if (!agent) throw new Error(`Agent not found: ${params.agentId}`);

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

  // Broadcast typing indicator while agent is working — auto-cleared after 90s
  // or when the agent's response is saved
  const { typingStatus } = await import("@/lib/db/schema");
  const typingExpiry = new Date(Date.now() + 90_000);
  try {
    if (params.channelId || params.conversationId) {
      await db
        .insert(typingStatus)
        .values({
          userId: agent.id,
          channelId: params.channelId || null,
          conversationId: params.conversationId || null,
          expiresAt: typingExpiry,
        });
    }
  } catch {
    // ignore — typing indicator is best-effort
  }

  // Local dynamic agent (a2aUrl points to our own /api/a2a/ endpoint) → use runAgent directly
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004").replace(/\/$/, "");
  const isLocalAgent = agent.a2aUrl?.startsWith(appUrl + "/api/a2a/") || agent.a2aUrl?.startsWith("http://localhost");

  // Built agent or local dynamic agent → LLM with tool-use loop
  if (isLocalAgent || (!agent.a2aUrl && card?.builtBy)) {
    try {
      // For local agents, load instruction from agentSkillConfigs if card has no systemPrompt
      let effectiveCard = card || {};
      if (isLocalAgent && !effectiveCard.systemPrompt) {
        const { agentSkillConfigs } = await import("@/lib/db/schema");
        const [skillConfig] = await db.select().from(agentSkillConfigs).where(eq(agentSkillConfigs.agentId, agent.id)).limit(1);
        if (skillConfig) {
          effectiveCard = { ...effectiveCard, systemPrompt: skillConfig.instruction, mcpAccess: (skillConfig.mcpTools as string[]) || [] };
        }
      }
      content = await runAgent(effectiveCard as BuiltAgentCard, params.text, agentName, pointer, params.skillId);
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
        variables: params.variables,
      });
      content = response.content;
      metadata = {
        a2aTaskId: response.taskId,
        a2aContextId: response.contextId,
        agentName,
        ...(response.responseMetadata && { a2aResponseMeta: response.responseMetadata }),
      };
    } catch (err) {
      console.error(`[sendToAgent] External A2A call failed for ${agent.displayName} (${rpcUrl}):`, err instanceof Error ? err.message : err);
      content = "I'm currently unavailable. Please try again later.";
      metadata = { agentName, error: true };
    }
  } else {
    content = "This agent is not configured to respond.";
    metadata = { agentName, error: true };
  }

  // Track chain depth to prevent infinite agent-to-agent engagement loops
  const incomingChainDepth = (params as unknown as { _chainDepth?: number })._chainDepth || 0;
  const MAX_CHAIN_DEPTH = 8;

  const [agentMessage] = await db
    .insert(messages)
    .values({
      channelId: params.channelId || null,
      conversationId: params.conversationId || null,
      userId: agent.id,
      content,
      contentType: "agent-response",
      metadata: { ...metadata, chainDepth: incomingChainDepth + 1 },
    })
    .returning();

  // Clear typing indicator now that response is saved
  try {
    await db.delete(typingStatus).where(eq(typingStatus.userId, agent.id));
  } catch { /* ignore */ }

  // Note: DM read status is handled client-side based on scroll position.
  // We do NOT auto-mark as read here — the user must actually see the message.

  // Autonomous orchestration: trigger auto-engage on agent's response
  // Other agents in the channel decide if they should jump in based on their engagementLevel
  // Cooldown, daily limits, and chain depth cap prevent runaway loops
  if (params.channelId && incomingChainDepth < MAX_CHAIN_DEPTH) {
    const { checkAutoEngagement } = await import("./auto-engage");
    checkAutoEngagement({
      channelId: params.channelId,
      messageContent: content,
      senderId: agent.id,
      _chainDepth: incomingChainDepth + 1,
    } as Parameters<typeof checkAutoEngagement>[0]).catch(() => {
      // ignore — let the chain continue if one agent fails
    });
  }

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
      const requiredParams = tool.parameters
        ? Object.entries(tool.parameters).filter(([, v]) => v.required).map(([k]) => k).join(",")
        : "";
      toolDocs.push(`${serverId}:${tool.name} — ${tool.description.slice(0, 80)}${requiredParams ? ` (${requiredParams}*)` : ""}`);
    }
  }

  if (toolDocs.length > 0) {
    systemParts.push(
      `## Available Tools\n${toolDocs.join("\n")}\n\nTo call a tool, write exactly this on its own line:\n[TOOL_CALL: server:tool | key=value, key=value]\n\nExample: [TOOL_CALL: news:search | query=bitcoin]`
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
  // Truncate very long messages — 8192-token context allows ~6000 chars safely
  const MAX_MSG_CHARS = 6000;
  let userContent = userMessage;
  if (userMessage.length > MAX_MSG_CHARS) {
    userContent = userMessage.slice(0, MAX_MSG_CHARS) +
      `\n\n[TRUNCATED — ${userMessage.length - MAX_MSG_CHARS} more chars. Use slack:read_thread to fetch full messages.]`;
  }
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
        // 8192-token context allows richer tool results
        const MAX_RESULT = 3500;
        const truncated = result.content.length > MAX_RESULT
          ? result.content.slice(0, MAX_RESULT) + `\n[... ${result.content.length - MAX_RESULT} more chars truncated]`
          : result.content;
        results.push(`[TOOL_RESULT: ${tc.tool}]\n${truncated}\n[/TOOL_RESULT]`);
      }
    }

    // Keep assistant tool-call verbatim (model needs it for context)
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
  const seenTools = new Set<string>();

  function parseParams(paramsStr: string): Record<string, string> {
    const params: Record<string, string> = {};
    const trimmed = paramsStr.trim();
    if (!trimmed) return params;

    // Try JSON-like {key: "value"} or {key: value}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1);
      // Match: key: "value" | key: value
      const jsonPairs = inner.matchAll(/(\w+)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/g);
      for (const m of jsonPairs) {
        const key = m[1];
        const val = (m[2] ?? m[3] ?? m[4] ?? "").trim();
        params[key] = val;
      }
      return params;
    }

    // key=value, key=value format
    if (trimmed.includes("=")) {
      for (const pair of trimmed.split(/,\s*/)) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx > 0) {
          params[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
        }
      }
      return params;
    }

    // Raw string treated as query
    params.query = trimmed;
    return params;
  }

  // Format 1: [TOOL_CALL: server:tool | key=value]
  const bracketRegex = /\[TOOL_CALL:\s*([^\]|]+?)(?:\s*\|\s*([^\]]*))?\]/g;
  let match;
  while ((match = bracketRegex.exec(text)) !== null) {
    const tool = match[1].trim();
    const params = parseParams(match[2] || "");
    const key = `${tool}:${JSON.stringify(params)}`;
    if (!seenTools.has(key)) {
      seenTools.add(key);
      calls.push({ tool, params });
    }
  }

  // Format 2: call:server:tool {params} — LLM sometimes uses this
  const callRegex = /(?:^|\n)\s*call:([\w-]+:[\w-]+)\s*(\{[^}]*\}|\([^)]*\))?/gi;
  while ((match = callRegex.exec(text)) !== null) {
    const tool = match[1].trim();
    const params = parseParams(match[2] || "");
    const key = `${tool}:${JSON.stringify(params)}`;
    if (!seenTools.has(key)) {
      seenTools.add(key);
      calls.push({ tool, params });
    }
  }

  return calls;
}

async function callLLM(
  llmMessages: Array<{ role: string; content: string }>
): Promise<string> {
  const res = await fetch(VLLM_CHAT_URL, {
    method: "POST",
    headers: llmHeaders(),
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages: llmMessages,
      max_completion_tokens: computeMaxTokens(llmMessages),
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

  const MAX_STREAM_MSG = 6000;
  const streamUserContent = params.text.length > MAX_STREAM_MSG
    ? params.text.slice(0, MAX_STREAM_MSG) + `\n\n[TRUNCATED — use slack:read_thread to fetch full context]`
    : params.text;

  const llmMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemContent },
    { role: "user", content: streamUserContent },
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
    const res = await fetch(VLLM_CHAT_URL, {
      method: "POST",
      headers: llmHeaders(),
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: llmMessages,
        max_completion_tokens: computeMaxTokens(llmMessages),
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
      const requiredParams = tool.parameters
        ? Object.entries(tool.parameters).filter(([, v]) => v.required).map(([k]) => k).join(",")
        : "";
      toolDocs.push(`${serverId}:${tool.name} — ${tool.description.slice(0, 80)}${requiredParams ? ` (${requiredParams}*)` : ""}`);
    }
  }

  if (toolDocs.length > 0) {
    systemParts.push(
      `## Available Tools\n${toolDocs.join("\n")}\n\nTo call a tool, write exactly this on its own line:\n[TOOL_CALL: server:tool | key=value, key=value]\n\nExample: [TOOL_CALL: news:search | query=bitcoin]`
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
