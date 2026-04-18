import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { inviteAgent } from "@/lib/a2a/agent-manager";
import { listAgentRows } from "@/lib/agents/list";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const workspaceId =
    url.searchParams.get("workspaceId") ?? url.searchParams.get("workspace_id");

  const agents = await listAgentRows(workspaceId);

  return NextResponse.json(
    agents.map((a) => {
      const card = (a.agentCardJson || {}) as { builtBy?: string };
      const isMine =
        a.agentInvitedBy === auth.user.id ||
        a.ownerId === auth.user.id ||
        card.builtBy === auth.user.id;
      return { ...a, isMine };
    })
  );
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
