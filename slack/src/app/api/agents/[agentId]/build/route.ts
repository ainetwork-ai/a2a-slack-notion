import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { users, agentSkillConfigs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface SkillIn {
  id?: string;
  name: string;
  description: string;
  instruction?: string;
}

/**
 * PATCH /api/agents/:agentId/build
 *   body: { name?, description?, systemPrompt?, mcpAccess?, skills?, capabilities? }
 *
 * Updates an existing built agent's metadata. Owner-only — owner is the user
 * recorded in agentCardJson.builtBy or users.agent_invited_by or users.owner_id.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { agentId } = await params;

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const card =
    (agent.agentCardJson as Record<string, unknown> | null) || {};
  const ownerId =
    (card.builtBy as string | undefined) ||
    agent.agentInvitedBy ||
    agent.ownerId;

  if (ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the agent's creator can edit it" },
      { status: 403 }
    );
  }

  const body = await req.json();

  const nextCard: Record<string, unknown> = { ...card };
  if (typeof body.name === "string" && body.name.trim()) {
    nextCard.name = body.name.trim();
  }
  if (typeof body.description === "string") {
    nextCard.description = body.description.trim() || (card.description as string) || "";
  }
  if (typeof body.systemPrompt === "string") {
    nextCard.systemPrompt = body.systemPrompt.trim();
  }
  if (Array.isArray(body.mcpAccess)) {
    nextCard.mcpAccess = Array.from(new Set([...body.mcpAccess, "slack"]));
  }
  if (Array.isArray(body.skills)) {
    const skillsIn = body.skills as SkillIn[];
    nextCard.skills = skillsIn.map((s) => ({
      id: s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: s.name,
      description: s.description,
      instruction: s.instruction || "",
    }));
  }
  if (body.capabilities && typeof body.capabilities === "object") {
    const cap = body.capabilities as {
      streaming?: boolean;
      pushNotifications?: boolean;
      extensions?: { uri: string; description: string; required: boolean }[];
    };
    const existingCap =
      (card.capabilities as Record<string, unknown> | undefined) || {};
    nextCard.capabilities = {
      ...existingCap,
      streaming: cap.streaming ?? existingCap.streaming ?? false,
      pushNotifications:
        cap.pushNotifications ?? existingCap.pushNotifications ?? false,
      stateTransitionHistory: existingCap.stateTransitionHistory ?? false,
      extensions: cap.extensions ?? existingCap.extensions ?? [],
    };
  }

  const updates: Record<string, unknown> = {
    agentCardJson: nextCard,
    updatedAt: new Date(),
  };
  if (nextCard.name && typeof nextCard.name === "string") {
    updates.displayName = nextCard.name;
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, agentId))
    .returning();

  // Sync per-skill configs (instructions live separately)
  if (Array.isArray(body.skills)) {
    const skillsIn = body.skills as SkillIn[];
    const systemPrompt =
      typeof body.systemPrompt === "string"
        ? body.systemPrompt.trim()
        : (card.systemPrompt as string | undefined) || "";
    const mcpAccessList = Array.isArray(nextCard.mcpAccess)
      ? (nextCard.mcpAccess as string[])
      : ["slack"];

    for (const s of skillsIn) {
      const skillId = s.id || s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const instruction = s.instruction?.trim() || systemPrompt;
      // upsert
      await db
        .insert(agentSkillConfigs)
        .values({
          agentId,
          skillId,
          instruction,
          mcpTools: mcpAccessList,
          outputFormat: "text",
          maxTokens: 2000,
        })
        .onConflictDoUpdate({
          target: [agentSkillConfigs.agentId, agentSkillConfigs.skillId],
          set: { instruction, mcpTools: mcpAccessList },
        });
    }
  }

  return NextResponse.json(updated);
}
