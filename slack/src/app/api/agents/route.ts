import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { inviteAgent } from "@/lib/a2a/agent-manager";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const agents = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      a2aUrl: users.a2aUrl,
      agentCardJson: users.agentCardJson,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.isAgent, true))
    .orderBy(users.displayName);

  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { a2aUrl, visibility, category, tags } = body;

  if (!a2aUrl || typeof a2aUrl !== "string") {
    return NextResponse.json({ error: "a2aUrl is required" }, { status: 400 });
  }

  const agent = await inviteAgent(a2aUrl, {
    invitedBy: auth.user.id,
    visibility: visibility as "public" | "private" | "unlisted" | undefined,
    category,
    tags: Array.isArray(tags) ? tags : undefined,
  });

  return NextResponse.json(agent, { status: 201 });
}
