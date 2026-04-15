import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workspaceId } = await params;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return NextResponse.json({ ...workspace, memberCount: count });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workspaceId } = await params;

  // Check role
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

  const body = await request.json();
  const { name, description, iconText, iconUrl, defaultNotificationPref, defaultChannels } = body as {
    name?: string;
    description?: string;
    iconText?: string;
    iconUrl?: string;
    defaultNotificationPref?: string;
    defaultChannels?: string[];
  };

  const updates: Partial<{
    name: string;
    description: string;
    iconText: string;
    iconUrl: string | null;
    defaultNotificationPref: string;
    defaultChannels: string[];
  }> = {};
  if (name) updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  if (iconText) updates.iconText = iconText.trim().slice(0, 3);
  if (iconUrl !== undefined) updates.iconUrl = iconUrl ? iconUrl.trim() : null;
  if (defaultNotificationPref !== undefined) {
    if (!["all", "mentions", "none"].includes(defaultNotificationPref)) {
      return NextResponse.json({ error: "Invalid defaultNotificationPref" }, { status: 400 });
    }
    updates.defaultNotificationPref = defaultNotificationPref;
  }
  if (defaultChannels !== undefined) updates.defaultChannels = defaultChannels;

  const [updated] = await db
    .update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, workspaceId))
    .returning();

  return NextResponse.json(updated);
}
