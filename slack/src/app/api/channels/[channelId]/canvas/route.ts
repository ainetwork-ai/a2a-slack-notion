import { db } from "@/lib/db";
import { canvases, channels, channelMembers, users } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  // Check membership
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const [canvas] = await db
    .select()
    .from(canvases)
    .where(eq(canvases.channelId, channelId))
    .limit(1);

  if (!canvas) {
    return NextResponse.json(null);
  }

  let updatedByUser = null;
  if (canvas.updatedBy) {
    const [u] = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, canvas.updatedBy))
      .limit(1);
    updatedByUser = u ?? null;
  }

  return NextResponse.json({ ...canvas, updatedByUser });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  // Check membership
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get workspaceId from channel
  const [ch] = await db
    .select({ workspaceId: channels.workspaceId, name: channels.name })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (!ch?.workspaceId) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Count existing canvases so each new one gets a unique default title (#channel canvas N)
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(canvases)
    .where(eq(canvases.channelId, channelId));

  const body = await request.json().catch(() => ({}));
  const defaultTitle = `#${ch.name ?? 'channel'} canvas${existingCount > 0 ? ` ${existingCount + 1}` : ''}`;
  const title = body.title?.trim() || defaultTitle;

  const [canvas] = await db
    .insert(canvases)
    .values({
      channelId,
      workspaceId: ch.workspaceId,
      title,
      content: "",
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json(canvas, { status: 201 });
}
