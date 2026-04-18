import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import {
  channelMcpIntegrations,
  channelMembers,
  channels,
  workspaceMcpIntegrations,
  workspaceMembers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { executeTool } from "@/lib/mcp/executor";

/**
 * Resolve whether a given MCP `serverId` is enabled for a request scoped by
 * either a channel or a workspace.
 *
 * Precedence rules:
 *   1. If `channelId` is supplied:
 *        - resolve the channel's workspace
 *        - look up workspace-level row + channel-level row for `serverId`
 *        - channel-level row WINS over workspace-level (channel override)
 *        - if neither exists → not enabled
 *        - if any of them is enabled and channel does not explicitly disable
 *          → enabled
 *   2. If only `workspaceId` is supplied (no channel — e.g. Notion page) → use
 *      workspace-level row only.
 *   3. If neither is supplied → no scope check (server-internal call).
 */
async function resolveServerEnabled(opts: {
  serverId: string;
  channelId?: string;
  workspaceId?: string;
}): Promise<{ enabled: boolean; reason?: string }> {
  const { serverId, channelId, workspaceId: explicitWorkspaceId } = opts;

  if (!channelId && !explicitWorkspaceId) {
    return { enabled: true };
  }

  // Determine the workspaceId to consult.
  let workspaceId = explicitWorkspaceId ?? null;
  if (!workspaceId && channelId) {
    const [ch] = await db
      .select({ workspaceId: channels.workspaceId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    workspaceId = ch?.workspaceId ?? null;
  }

  // Channel-level row (only if a channel is in scope)
  let channelRow: { enabled: boolean } | null = null;
  if (channelId) {
    const rows = await db
      .select({ enabled: channelMcpIntegrations.enabled })
      .from(channelMcpIntegrations)
      .where(
        and(
          eq(channelMcpIntegrations.channelId, channelId),
          eq(channelMcpIntegrations.serverId, serverId)
        )
      )
      .limit(1);
    channelRow = rows[0] ?? null;
  }

  // Workspace-level row
  let workspaceRow: { enabled: boolean } | null = null;
  if (workspaceId) {
    const rows = await db
      .select({ enabled: workspaceMcpIntegrations.enabled })
      .from(workspaceMcpIntegrations)
      .where(
        and(
          eq(workspaceMcpIntegrations.workspaceId, workspaceId),
          eq(workspaceMcpIntegrations.serverId, serverId)
        )
      )
      .limit(1);
    workspaceRow = rows[0] ?? null;
  }

  // Channel override wins.
  if (channelRow !== null) {
    return channelRow.enabled
      ? { enabled: true }
      : { enabled: false, reason: "channel disabled" };
  }

  // No channel row — fall back to workspace.
  if (workspaceRow !== null) {
    return workspaceRow.enabled
      ? { enabled: true }
      : { enabled: false, reason: "workspace disabled" };
  }

  return { enabled: false, reason: "not installed at workspace or channel level" };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { serverId, toolName, params, channelId, workspaceId } =
    (await request.json()) as {
      serverId?: string;
      toolName?: string;
      params?: Record<string, unknown>;
      channelId?: string;
      workspaceId?: string;
    };

  if (!serverId || !toolName) {
    return NextResponse.json(
      { error: "serverId and toolName are required" },
      { status: 400 }
    );
  }

  // Membership check + enablement check.
  // The caller picks scope: channelId XOR workspaceId (or neither, for
  // server-internal calls — but those should not go through this HTTP route).
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

    const verdict = await resolveServerEnabled({ serverId, channelId });
    if (!verdict.enabled) {
      return NextResponse.json(
        {
          error: `${serverId} is not enabled for this channel (${verdict.reason}). Ask an admin to enable it in channel or workspace settings.`,
        },
        { status: 403 }
      );
    }
  } else if (workspaceId) {
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
    }

    const verdict = await resolveServerEnabled({ serverId, workspaceId });
    if (!verdict.enabled) {
      return NextResponse.json(
        {
          error: `${serverId} is not enabled for this workspace (${verdict.reason}). Ask an admin to enable it in workspace settings.`,
        },
        { status: 403 }
      );
    }
  }

  const result = await executeTool(serverId, toolName, params || {});

  return NextResponse.json(result);
}
