import { db } from "@/lib/db";
import { channelMembers, users } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { analyzeIntent } from "./client";
import { sendToAgent } from "./message-bridge";

// Engagement level thresholds for auto-response confidence
const CONFIDENCE_THRESHOLDS: Record<number, number> = {
  1: 0.4, // reactive: respond if confidence >= 40%
  2: 0.2, // engaged: respond if confidence >= 20%
  3: 0.05, // proactive: respond if confidence >= 5%
};

// Daily response limits per engagement level
const DAILY_LIMITS: Record<number, number> = {
  1: 10,
  2: 20,
  3: 50,
};

const COOLDOWN_MS = 30 * 1000; // 30 seconds — short enough for iterative workflows

// Level-3 (proactive) agents bypass LLM analysis for casual group greetings.
// These patterns are language-agnostic and intentionally broad.
const PROACTIVE_GREETING_RE =
  /얘들아|야들아|여러분|다들|모두|뭐해|뭐하니|뭐하고있|안녕|하이|ㅎㅇ|hey\b|hi\b|hello\b|sup\b|yo\b|guys|everyone|what('s| is) up/i;

const VLLM_BASE_URL = process.env.VLLM_URL || "http://localhost:8100";
const VLLM_MODEL = process.env.VLLM_MODEL || "gemma-4-31B-it";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
// If VLLM_URL already points at /chat/completions, use it verbatim; otherwise append.
const VLLM_CHAT_URL = VLLM_BASE_URL.includes("/chat/completions")
  ? VLLM_BASE_URL
  : `${VLLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`;

/**
 * Use LLM to decide if a built agent should respond to a message.
 * Returns a confidence score 0-1.
 */
async function analyzeIntentWithLLM(params: {
  agentName: string;
  skills: string[];
  systemPrompt?: string;
  messageContent: string;
  senderIsAgent: boolean;
}): Promise<{ confidence: number; reason: string }> {
  try {
    const prompt = `You are evaluating whether an agent should respond to a message in a chat channel.

Agent: ${params.agentName}
Agent skills/role:
${params.skills.slice(0, 5).join("\n")}
${params.systemPrompt ? `\nAgent system prompt:\n${params.systemPrompt.slice(0, 300)}` : ""}

Message from ${params.senderIsAgent ? "another agent" : "user"}:
"${params.messageContent.slice(0, 500)}"

Should ${params.agentName} respond? Consider:
- Does the message directly address this agent's role/skills?
- Is there work in the message that this agent is specialized to do?
- Is it a natural handoff point in a multi-agent workflow?

Respond with a JSON object only: {"confidence": 0.0-1.0, "reason": "brief explanation"}
Use 0.0 if definitely should not respond, 1.0 if definitely should.`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (LLM_API_KEY) headers["api-key"] = LLM_API_KEY;
    const res = await fetch(VLLM_CHAT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 100,
      }),
    });

    if (!res.ok) return { confidence: 0, reason: "llm error" };
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[^}]*"confidence"\s*:\s*([\d.]+)[^}]*"reason"\s*:\s*"([^"]*)"[^}]*\}/);
    if (match) {
      return { confidence: Math.min(Math.max(parseFloat(match[1]), 0), 1), reason: match[2] };
    }
    // Fallback: look for any number 0-1
    const numMatch = content.match(/\b(0\.\d+|1\.0|0|1)\b/);
    return { confidence: numMatch ? parseFloat(numMatch[1]) : 0, reason: "parsed" };
  } catch {
    return { confidence: 0, reason: "exception" };
  }
}

export async function checkAutoEngagement(params: {
  channelId: string;
  messageContent: string;
  senderId: string;
  recentMessages?: string[];
  _chainDepth?: number;
}) {
  const { channelId, messageContent, senderId, recentMessages = [], _chainDepth = 0 } = params;

  // Query agent members in channel with engagementLevel > 0
  const agentMembers = await db
    .select({
      userId: channelMembers.userId,
      engagementLevel: channelMembers.engagementLevel,
      lastAutoResponseAt: channelMembers.lastAutoResponseAt,
      autoResponseCount: channelMembers.autoResponseCount,
      a2aUrl: users.a2aUrl,
      agentCardJson: users.agentCardJson,
      displayName: users.displayName,
    })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(users.isAgent, true),
        gt(channelMembers.engagementLevel, 0)
      )
    );

  const now = new Date();

  for (const member of agentMembers) {
    // Skip if this agent sent the message
    if (member.userId === senderId) continue;

    const level = member.engagementLevel;

    // Skip if within cooldown period
    if (member.lastAutoResponseAt) {
      const elapsed = now.getTime() - member.lastAutoResponseAt.getTime();
      if (elapsed < COOLDOWN_MS) continue;
    }

    // Skip if daily limit reached
    const dailyLimit = DAILY_LIMITS[level] ?? 10;
    if (member.autoResponseCount >= dailyLimit) continue;

    // Build skill tags from agent card
    const card = member.agentCardJson as {
      skills?: Array<{ id: string; name: string; description: string; tags?: string[] }>;
      url?: string;
    } | null;

    const agentSkills: string[] = [];
    if (card?.skills) {
      for (const skill of card.skills) {
        agentSkills.push(skill.name);
        agentSkills.push(skill.description);
        if (skill.tags) agentSkills.push(...skill.tags);
      }
    }

    // Use card.url or a2aUrl for intent analysis RPC endpoint
    const rpcUrl = card?.url || member.a2aUrl;

    let shouldRespond = false;
    let suggestedSkillId: string | undefined;

    // Level-3 proactive: casual group greetings always get a response
    if (level >= 3 && PROACTIVE_GREETING_RE.test(messageContent)) {
      shouldRespond = true;
    } else if (rpcUrl) {
      const result = await analyzeIntent(rpcUrl, messageContent, {
        channel: channelId,
        recentMessages,
        agentSkills,
      });

      const threshold = CONFIDENCE_THRESHOLDS[level] ?? 0.4;
      shouldRespond = result.confidence >= threshold;
      suggestedSkillId = result.suggestedSkillId;
    } else if (agentSkills.length > 0) {
      // No RPC — use LLM for multi-lingual semantic intent analysis
      const result = await analyzeIntentWithLLM({
        agentName: member.displayName,
        skills: agentSkills,
        systemPrompt: (card as { systemPrompt?: string } | null)?.systemPrompt,
        messageContent,
        senderIsAgent: !!(await db.select({ isAgent: users.isAgent }).from(users).where(eq(users.id, senderId)).limit(1).then(r => r[0]?.isAgent)),
      });

      const threshold = CONFIDENCE_THRESHOLDS[level] ?? 0.4;
      shouldRespond = result.confidence >= threshold;
    }

    if (!shouldRespond) continue;

    // Update tracking fields before sending (optimistic update to prevent double-fire)
    await db
      .update(channelMembers)
      .set({
        lastAutoResponseAt: now,
        autoResponseCount: member.autoResponseCount + 1,
      })
      .where(
        and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, member.userId)
        )
      );

    // Send message to agent (fire-and-forget within this loop)
    // Pass chain depth so agent-to-agent orchestration has a safety cap
    sendToAgent({
      agentId: member.userId,
      text: messageContent,
      channelId,
      skillId: suggestedSkillId,
      _chainDepth,
    } as Parameters<typeof sendToAgent>[0]).catch(() => {
      // Ignore errors — agent may be unavailable
    });
  }
}
