import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import {
  workspaceMcpIntegrations,
  workspaceMembers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServer } from "@/lib/mcp/registry";
import { resolveWorkspaceParam } from "@/lib/resolve";

// GET: List MCP integrations for a workspace. Any workspace member can read.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { workspaceId: param } = await params;
    const workspace = await resolveWorkspaceParam(param);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const workspaceId = workspace.id;

    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const integrations = await db
      .select()
      .from(workspaceMcpIntegrations)
      .where(eq(workspaceMcpIntegrations.workspaceId, workspaceId));

    return NextResponse.json(integrations);
  } catch (err) {
    console.error("[workspace mcp GET]", err);
    return NextResponse.json(
      { error: "Failed to list workspace MCP integrations", detail: String(err) },
      { status: 500 }
    );
  }
}

// POST: Add MCP integration to workspace (owner/admin only). Upserts by (workspaceId, serverId).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { workspaceId: param } = await params;
    const workspace = await resolveWorkspaceParam(param);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const workspaceId = workspace.id;

    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Forbidden — owner or admin required" },
        { status: 403 }
      );
    }

    const { serverId, config } = await request.json();

    if (!serverId || typeof serverId !== "string") {
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
      .insert(workspaceMcpIntegrations)
      .values({
        workspaceId,
        serverId,
        enabled: true,
        config: config ?? null,
        addedBy: user.id,
      })
      .onConflictDoUpdate({
        target: [
          workspaceMcpIntegrations.workspaceId,
          workspaceMcpIntegrations.serverId,
        ],
        set: { enabled: true, config: config ?? null },
      })
      .returning();

    return NextResponse.json(integration);
  } catch (err) {
    console.error("[workspace mcp POST]", err);
    return NextResponse.json(
      { error: "Failed to add workspace MCP integration", detail: String(err) },
      { status: 500 }
    );
  }
}

// PATCH: Toggle enabled/disabled (owner/admin only).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { workspaceId: param } = await params;
    const workspace = await resolveWorkspaceParam(param);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const workspaceId = workspace.id;

    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Forbidden — owner or admin required" },
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
      .update(workspaceMcpIntegrations)
      .set({ enabled })
      .where(
        and(
          eq(workspaceMcpIntegrations.workspaceId, workspaceId),
          eq(workspaceMcpIntegrations.serverId, serverId)
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
    console.error("[workspace mcp PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update workspace MCP integration", detail: String(err) },
      { status: 500 }
    );
  }
}

// DELETE: Remove a workspace MCP integration (owner/admin only).
// serverId may come from query string (?serverId=...) or JSON body.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const { workspaceId: param } = await params;
    const workspace = await resolveWorkspaceParam(param);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const workspaceId = workspace.id;

    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Forbidden — owner or admin required" },
        { status: 403 }
      );
    }

    let serverId = new URL(request.url).searchParams.get("serverId");
    if (!serverId) {
      try {
        const body = await request.json();
        if (body && typeof body.serverId === "string") {
          serverId = body.serverId;
        }
      } catch {
        // no body — fine, we already tried query
      }
    }

    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required (query or body)" },
        { status: 400 }
      );
    }

    await db
      .delete(workspaceMcpIntegrations)
      .where(
        and(
          eq(workspaceMcpIntegrations.workspaceId, workspaceId),
          eq(workspaceMcpIntegrations.serverId, serverId)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[workspace mcp DELETE]", err);
    return NextResponse.json(
      { error: "Failed to remove workspace MCP integration", detail: String(err) },
      { status: 500 }
    );
  }
}
