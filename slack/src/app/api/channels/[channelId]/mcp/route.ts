import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import {
  channelMcpIntegrations,
  channelMembers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServer } from "@/lib/mcp/registry";
import { resolveChannelParam } from "@/lib/resolve";

// GET: List MCP integrations for a channel
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { channelId: param } = await params;
    const channel = await resolveChannelParam(param, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = channel.id;

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

    const integrations = await db
      .select()
      .from(channelMcpIntegrations)
      .where(eq(channelMcpIntegrations.channelId, channelId));

    return NextResponse.json(integrations);
  } catch (err) {
    console.error("[mcp GET]", err);
    return NextResponse.json(
      { error: "Failed to list MCP integrations", detail: String(err) },
      { status: 500 }
    );
  }
}

// POST: Add MCP integration to channel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { channelId: param } = await params;
    const channel = await resolveChannelParam(param, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = channel.id;

    // Check admin/owner role
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
      return NextResponse.json(
        { error: "Not a member" },
        { status: 403 }
      );
    }

    const { serverId, config } = await request.json();

    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required" },
        { status: 400 }
      );
    }

    const server = getServer(serverId);
    if (!server) {
      return NextResponse.json(
        { error: `Unknown MCP server: ${serverId}` },
        { status: 400 }
      );
    }

    const [integration] = await db
      .insert(channelMcpIntegrations)
      .values({
        channelId,
        serverId,
        enabled: true,
        config: config || null,
        addedBy: user.id,
      })
      .onConflictDoUpdate({
        target: [
          channelMcpIntegrations.channelId,
          channelMcpIntegrations.serverId,
        ],
        set: { enabled: true, config: config || null },
      })
      .returning();

    return NextResponse.json(integration);
  } catch (err) {
    console.error("[mcp POST]", err);
    return NextResponse.json(
      { error: "Failed to add MCP integration", detail: String(err) },
      { status: 500 }
    );
  }
}

// PATCH: Toggle MCP integration enabled/disabled
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { channelId: param } = await params;
    const channel = await resolveChannelParam(param, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = channel.id;

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
      return NextResponse.json(
        { error: "Not a member" },
        { status: 403 }
      );
    }

    const { serverId, enabled } = await request.json();

    if (!serverId || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "serverId and enabled (boolean) are required" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(channelMcpIntegrations)
      .set({ enabled })
      .where(
        and(
          eq(channelMcpIntegrations.channelId, channelId),
          eq(channelMcpIntegrations.serverId, serverId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[mcp PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update MCP integration", detail: String(err) },
      { status: 500 }
    );
  }
}

// DELETE: Remove MCP integration from channel
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { channelId: param } = await params;
    const channel = await resolveChannelParam(param, user.id);
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = channel.id;

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
      return NextResponse.json(
        { error: "Not a member" },
        { status: 403 }
      );
    }

    const { serverId } = await request.json();

    await db
      .delete(channelMcpIntegrations)
      .where(
        and(
          eq(channelMcpIntegrations.channelId, channelId),
          eq(channelMcpIntegrations.serverId, serverId)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mcp DELETE]", err);
    return NextResponse.json(
      { error: "Failed to remove MCP integration", detail: String(err) },
      { status: 500 }
    );
  }
}
