import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { channelMcpIntegrations, channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeTool } from "@/lib/mcp/executor";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { serverId, toolName, params, channelId } = await request.json();

  if (!serverId || !toolName) {
    return NextResponse.json(
      { error: "serverId and toolName are required" },
      { status: 400 }
    );
  }

  // If channelId provided, verify membership and MCP is enabled for that channel
  if (channelId) {
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const [integration] = await db
      .select()
      .from(channelMcpIntegrations)
      .where(
        and(
          eq(channelMcpIntegrations.channelId, channelId),
          eq(channelMcpIntegrations.serverId, serverId),
          eq(channelMcpIntegrations.enabled, true)
        )
      )
      .limit(1);

    if (!integration) {
      return NextResponse.json(
        { error: `${serverId} is not enabled in this channel. Ask an admin to enable it in channel settings.` },
        { status: 403 }
      );
    }
  }

  const result = await executeTool(serverId, toolName, params || {});

  return NextResponse.json(result);
}
