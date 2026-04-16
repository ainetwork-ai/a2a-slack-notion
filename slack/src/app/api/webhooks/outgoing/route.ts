import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { outgoingWebhooks, workspaceMembers, channels } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

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
      id: outgoingWebhooks.id,
      name: outgoingWebhooks.name,
      triggerWords: outgoingWebhooks.triggerWords,
      url: outgoingWebhooks.url,
      channelId: outgoingWebhooks.channelId,
      channelName: channels.name,
      createdAt: outgoingWebhooks.createdAt,
    })
    .from(outgoingWebhooks)
    .leftJoin(channels, eq(outgoingWebhooks.channelId, channels.id))
    .where(eq(outgoingWebhooks.workspaceId, workspaceId));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { workspaceId, channelId, name, triggerWords, url } = body as {
    workspaceId?: string;
    channelId?: string;
    name?: string;
    triggerWords?: string;
    url?: string;
  };

  if (!workspaceId || !name || !triggerWords || !url) {
    return NextResponse.json(
      { error: "workspaceId, name, triggerWords, and url are required" },
      { status: 400 }
    );
  }

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

  const [webhook] = await db
    .insert(outgoingWebhooks)
    .values({
      workspaceId,
      channelId: channelId || null,
      name: name.trim(),
      triggerWords: triggerWords.trim(),
      url: url.trim(),
      createdBy: auth.user.id,
    })
    .returning();

  return NextResponse.json(webhook, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { id, workspaceId } = body as { id?: string; workspaceId?: string };

  if (!id || !workspaceId) {
    return NextResponse.json({ error: "id and workspaceId are required" }, { status: 400 });
  }

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
    .delete(outgoingWebhooks)
    .where(and(eq(outgoingWebhooks.id, id), eq(outgoingWebhooks.workspaceId, workspaceId)));

  return NextResponse.json({ success: true });
}
