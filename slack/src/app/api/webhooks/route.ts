import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { webhooks, workspaceMembers, channels } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logAudit } from "@/lib/audit";
import { resolveWorkspaceIdQuery, resolveWorkspaceParam } from "@/lib/resolve";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const workspaceId = await resolveWorkspaceIdQuery(request);
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Verify caller is a member
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, auth.user.id)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: webhooks.id,
      name: webhooks.name,
      token: webhooks.token,
      channelId: webhooks.channelId,
      channelName: channels.name,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .innerJoin(channels, eq(webhooks.channelId, channels.id))
    .where(eq(webhooks.workspaceId, workspaceId));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { workspaceId: workspaceRef, channelId, name } = body as {
    workspaceId?: string;
    channelId?: string;
    name?: string;
  };

  if (!workspaceRef || !channelId || !name) {
    return NextResponse.json({ error: "workspaceId, channelId, and name are required" }, { status: 400 });
  }

  const ws = await resolveWorkspaceParam(workspaceRef);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Verify caller is admin or owner
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, auth.user.id)
      )
    )
    .limit(1);

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = randomBytes(24).toString("hex");

  const [webhook] = await db
    .insert(webhooks)
    .values({
      workspaceId,
      channelId,
      name: name.trim(),
      token,
      createdBy: auth.user.id,
    })
    .returning();

  await logAudit(workspaceId, auth.user.id, "webhook.create", "channel", channelId, { webhookId: webhook.id, name: webhook.name });

  return NextResponse.json(webhook, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { id, workspaceId: workspaceRef } = body as {
    id?: string;
    workspaceId?: string;
  };

  if (!id || !workspaceRef) {
    return NextResponse.json({ error: "id and workspaceId are required" }, { status: 400 });
  }

  const ws = await resolveWorkspaceParam(workspaceRef);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = ws.id;

  // Verify caller is admin or owner
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, auth.user.id)
      )
    )
    .limit(1);

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspaceId)));

  await logAudit(workspaceId, auth.user.id, "webhook.delete", "channel", id);

  return NextResponse.json({ success: true });
}
