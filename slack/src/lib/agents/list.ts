import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface ListedAgent {
  id: string;
  a2aId: string | null;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  a2aUrl: string | null;
  agentCardJson: unknown;
  agentInvitedBy: string | null;
  ownerId: string | null;
  agentCategory: string | null;
  agentTags: string[] | null;
  createdAt: Date;
}

export async function listAgentRows(workspaceId?: string | null): Promise<ListedAgent[]> {
  const baseSelect = {
    id: users.id,
    a2aId: users.a2aId,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    status: users.status,
    a2aUrl: users.a2aUrl,
    agentCardJson: users.agentCardJson,
    agentInvitedBy: users.agentInvitedBy,
    ownerId: users.ownerId,
    agentCategory: users.agentCategory,
    agentTags: users.agentTags,
    createdAt: users.createdAt,
  } as const;

  if (workspaceId) {
    return db
      .select(baseSelect)
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .where(
        and(
          eq(users.isAgent, true),
          eq(workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .orderBy(users.displayName);
  }

  return db
    .select(baseSelect)
    .from(users)
    .where(eq(users.isAgent, true))
    .orderBy(users.displayName);
}
