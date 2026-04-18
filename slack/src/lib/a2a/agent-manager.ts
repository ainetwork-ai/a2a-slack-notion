import { db } from "@/lib/db";
import { users, channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchAgentCard, type AgentCard } from "./client";

export interface InviteAgentOptions {
  invitedBy?: string;
  visibility?: "public" | "private" | "unlisted";
  category?: string;
  tags?: string[];
}

export async function inviteAgent(a2aUrl: string, options: InviteAgentOptions = {}) {
  const card = await fetchAgentCard(a2aUrl);

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.a2aUrl, a2aUrl))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        agentCardJson: card as unknown as Record<string, unknown>,
        avatarUrl: card.iconUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    return existing;
  }

  const ainAddress = `agent-${card.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const nameSlug = card.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a2aId = nameSlug || undefined;

  const [agent] = await db
    .insert(users)
    .values({
      ainAddress,
      displayName: card.name,
      avatarUrl: card.iconUrl || null,
      isAgent: true,
      a2aUrl,
      a2aId: a2aId ?? null,
      agentCardJson: card as unknown as Record<string, unknown>,
      status: "online",
      agentInvitedBy: options.invitedBy ?? null,
      agentVisibility: options.visibility ?? "private",
      agentCategory: options.category ?? null,
      agentTags: options.tags ?? [],
    })
    .returning();

  return agent;
}

export async function removeAgent(agentId: string) {
  await db
    .delete(channelMembers)
    .where(eq(channelMembers.userId, agentId));
  await db.delete(users).where(and(eq(users.id, agentId), eq(users.isAgent, true)));
}

export async function getAgentSkills(agentId: string) {
  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent?.agentCardJson) return [];
  const card = agent.agentCardJson as unknown as AgentCard;
  return card.skills || [];
}

export async function healthCheck(agentId: string): Promise<boolean> {
  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent?.a2aUrl) return false;

  try {
    const card = await fetchAgentCard(agent.a2aUrl);
    await db
      .update(users)
      .set({
        agentCardJson: card as unknown as Record<string, unknown>,
        avatarUrl: card.iconUrl || null,
        status: "online",
        updatedAt: new Date(),
      })
      .where(eq(users.id, agentId));
    return true;
  } catch {
    await db
      .update(users)
      .set({ status: "offline", updatedAt: new Date() })
      .where(eq(users.id, agentId));
    return false;
  }
}
