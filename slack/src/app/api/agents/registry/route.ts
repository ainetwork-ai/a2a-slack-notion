import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/agents/registry
 *   ?tab=mine|public|workspace (default: public)
 *   &q=<search text>
 *   &category=<category>
 *
 * Returns a unified list of agents for the sidebar tabs and the discover modal.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") || "public";
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();

  const conditions = [eq(users.isAgent, true)];

  if (tab === "mine") {
    conditions.push(eq(users.agentInvitedBy, auth.user.id));
  } else if (tab === "public") {
    conditions.push(eq(users.agentVisibility, "public"));
  }
  // tab === "workspace" => no additional filter (all agents known to this install)

  if (category) {
    conditions.push(eq(users.agentCategory, category));
  }

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(users.displayName, pattern),
        sql`${users.agentCardJson}->>'description' ILIKE ${pattern}`
      )!
    );
  }

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      a2aUrl: users.a2aUrl,
      agentCardJson: users.agentCardJson,
      agentInvitedBy: users.agentInvitedBy,
      agentVisibility: users.agentVisibility,
      agentCategory: users.agentCategory,
      agentTags: users.agentTags,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.createdAt));

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      isMine: r.agentInvitedBy === auth.user.id,
    }))
  );
}
