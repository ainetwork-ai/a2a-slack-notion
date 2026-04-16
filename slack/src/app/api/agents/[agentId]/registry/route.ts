import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

const VALID_VISIBILITIES = ["public", "private", "unlisted"] as const;

/**
 * PATCH /api/agents/:agentId/registry
 *   body: { visibility?, category?, tags? }
 *
 * Owner-only. Updates the registry metadata for an agent I invited.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { agentId } = await params;
  const body = await request.json();

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.agentInvitedBy !== auth.user.id) {
    return NextResponse.json(
      { error: "Only the owner (first inviter) can edit registry metadata" },
      { status: 403 }
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.visibility === "string") {
    if (!VALID_VISIBILITIES.includes(body.visibility)) {
      return NextResponse.json(
        { error: `visibility must be one of ${VALID_VISIBILITIES.join(", ")}` },
        { status: 400 }
      );
    }
    updates.agentVisibility = body.visibility;
  }

  if (typeof body.category === "string" || body.category === null) {
    updates.agentCategory = body.category || null;
  }

  if (Array.isArray(body.tags)) {
    updates.agentTags = body.tags.filter((t: unknown) => typeof t === "string");
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, agentId))
    .returning({
      id: users.id,
      agentVisibility: users.agentVisibility,
      agentCategory: users.agentCategory,
      agentTags: users.agentTags,
    });

  return NextResponse.json(updated);
}
