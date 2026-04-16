import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextResponse } from "next/server";

const BUILDER_A2A_ID = "builder";
const BUILDER_NAME = "Builder";

const BUILDER_CARD = {
  name: BUILDER_NAME,
  description:
    "I help you create new A2A agents and channels through natural conversation. Tell me what you want to build.",
  isBuilder: true,
  version: "1.0.0",
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "create-agent",
      name: "Create Agent",
      description: "Create a new A2A agent from a natural-language description",
      tags: ["builder"],
      examples: [
        "Create a researcher agent that finds news articles",
        "한국어 번역 에이전트 만들어줘",
      ],
    },
    {
      id: "create-channel",
      name: "Create Channel",
      description: "Create a channel and optionally invite agents",
      tags: ["builder"],
      examples: ["Create a #newsroom channel and invite researcher and writer"],
    },
  ],
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
};

/**
 * GET /api/agents/builder
 *
 * Returns the singleton Builder agent. Creates it on first call. Adds it to the
 * caller's workspaces so the DM "just works".
 */
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  let [builder] = await db
    .select()
    .from(users)
    .where(and(eq(users.isAgent, true), eq(users.a2aId, BUILDER_A2A_ID)))
    .limit(1);

  if (!builder) {
    [builder] = await db
      .insert(users)
      .values({
        ainAddress: `agent-builder-${Date.now()}`,
        displayName: BUILDER_NAME,
        isAgent: true,
        status: "online",
        a2aId: BUILDER_A2A_ID,
        agentCardJson: BUILDER_CARD,
        agentVisibility: "public",
        agentCategory: "system",
      })
      .returning();
  }

  // Make sure the Builder is a member of every workspace the caller is in
  const callerWorkspaces = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, auth.user.id));

  for (const ws of callerWorkspaces) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws.workspaceId, userId: builder.id, role: "member" })
      .onConflictDoNothing();
  }

  return NextResponse.json({
    id: builder.id,
    displayName: builder.displayName,
    avatarUrl: builder.avatarUrl,
    status: builder.status,
    a2aId: builder.a2aId,
  });
}
