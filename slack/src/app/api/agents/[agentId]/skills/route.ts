import { db } from "@/lib/db";
import { users, agentSkillConfigs, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { agentId } = await params;

  const [agent] = await db
    .select({ id: users.id, isAgent: users.isAgent })
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const skillConfigs = await db
    .select()
    .from(agentSkillConfigs)
    .where(eq(agentSkillConfigs.agentId, agentId))
    .orderBy(agentSkillConfigs.skillId);

  return NextResponse.json(skillConfigs);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { agentId } = await params;
  const { user } = auth;

  const [agent] = await db
    .select({ id: users.id, isAgent: users.isAgent, agentCardJson: users.agentCardJson })
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Check ownership: agent creator or workspace admin can modify
  const card = agent.agentCardJson as { builtBy?: string } | null;
  const isAgentOwner = card?.builtBy === user.id;

  const [wsAdmin] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.role, "owner")
      )
    )
    .limit(1);

  if (!isAgentOwner && !wsAdmin) {
    return NextResponse.json(
      { error: "Only the agent creator or workspace admin can modify skill configs" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { skillId, instruction, mcpTools, outputFormat, temperature, maxTokens } = body as {
    skillId?: string;
    instruction?: string;
    mcpTools?: string[];
    outputFormat?: string;
    temperature?: number;
    maxTokens?: number;
  };

  if (!skillId || typeof skillId !== "string") {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const updates: Partial<{
    instruction: string;
    mcpTools: string[];
    outputFormat: string;
    temperature: number;
    maxTokens: number;
  }> = {};

  if (instruction !== undefined) updates.instruction = instruction;
  if (mcpTools !== undefined) updates.mcpTools = mcpTools;
  if (outputFormat !== undefined) updates.outputFormat = outputFormat;
  if (temperature !== undefined) updates.temperature = temperature;
  if (maxTokens !== undefined) updates.maxTokens = maxTokens;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(agentSkillConfigs)
    .set(updates)
    .where(
      and(
        eq(agentSkillConfigs.agentId, agentId),
        eq(agentSkillConfigs.skillId, skillId)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Skill config not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
