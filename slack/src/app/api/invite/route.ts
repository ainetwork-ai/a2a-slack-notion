import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { inviteTokens, workspaces } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createHash } from "crypto";

function generateInviteToken(workspaceId: string): string {
  const timestamp = Date.now().toString(36);
  const hash = createHash("sha256")
    .update(`${workspaceId}:${timestamp}:${process.env.SESSION_SECRET || "salt"}`)
    .digest("hex")
    .slice(0, 12);
  return hash;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { workspaceId } = body as { workspaceId?: string };

  // Resolve workspace: use provided id or fall back to default workspace
  let resolvedWorkspaceId = workspaceId;
  if (!resolvedWorkspaceId) {
    const [defaultWs] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, "Slack-A2A"))
      .limit(1);
    resolvedWorkspaceId = defaultWs?.id;
  }

  if (!resolvedWorkspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const token = generateInviteToken(resolvedWorkspaceId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(inviteTokens).values({
    token,
    workspaceId: resolvedWorkspaceId,
    createdBy: auth.user.id,
    expiresAt,
  });

  const baseUrl =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3004";
  // Unified invite link — works for both Slack and Notion (one Next.js
  // process, one workspaceMembers row on accept, both views unlocked).
  const link = `${baseUrl}/invite/${token}`;

  return NextResponse.json({ token, link, workspaceId: resolvedWorkspaceId, expiresAt });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const [invite] = await db
    .select({
      id: inviteTokens.id,
      workspaceId: inviteTokens.workspaceId,
      expiresAt: inviteTokens.expiresAt,
      workspaceName: workspaces.name,
    })
    .from(inviteTokens)
    .innerJoin(workspaces, eq(inviteTokens.workspaceId, workspaces.id))
    .where(
      and(
        eq(inviteTokens.token, token),
        gt(inviteTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!invite) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspaceName,
    expiresAt: invite.expiresAt,
  });
}
