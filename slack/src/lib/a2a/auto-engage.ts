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

const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

export async function checkAutoEngagement(params: {
  channelId: string;
  messageContent: string;
  senderId: string;
  recentMessages?: string[];
}) {
  const { channelId, messageContent, senderId, recentMessages = [] } = params;

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

    if (rpcUrl) {
      const result = await analyzeIntent(rpcUrl, messageContent, {
        channel: channelId,
        recentMessages,
        agentSkills,
      });

      const threshold = CONFIDENCE_THRESHOLDS[level] ?? 0.4;
      shouldRespond = result.confidence >= threshold;
      suggestedSkillId = result.suggestedSkillId;
    } else if (agentSkills.length > 0) {
      // No URL available — do pure keyword match locally
      const messageTokens = messageContent
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);
      const skillTokenSet = new Set(
        agentSkills.join(" ").toLowerCase().split(/\s+/).filter((t) => t.length > 2)
      );
      const matches = messageTokens.filter((t) => skillTokenSet.has(t));
      const confidence = messageTokens.length > 0 ? matches.length / messageTokens.length : 0;
      const threshold = CONFIDENCE_THRESHOLDS[level] ?? 0.4;
      shouldRespond = confidence >= threshold;
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
    sendToAgent({
      agentId: member.userId,
      text: messageContent,
      channelId,
      skillId: suggestedSkillId,
    }).catch(() => {
      // Ignore errors — agent may be unavailable
    });
  }
}
