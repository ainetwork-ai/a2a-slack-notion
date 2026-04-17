import { db } from "@/lib/db";
import { channelBookmarks, channelMembers } from "@/lib/db/schema";
import { eq, and, asc, max } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { resolveChannelParam } from "@/lib/resolve";

async function requireMember(channelParam: string, userId: string) {
  const channel = await resolveChannelParam(channelParam, userId);
  if (!channel) return { error: NextResponse.json({ error: "Channel not found" }, { status: 404 }) };
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channel.id), eq(channelMembers.userId, userId)))
    .limit(1);
  if (!membership) return { error: NextResponse.json({ error: "Not a member" }, { status: 403 }) };
  return { channelId: channel.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const resolved = await requireMember(param, user.id);
  if ("error" in resolved) return resolved.error;

  const rows = await db
    .select()
    .from(channelBookmarks)
    .where(eq(channelBookmarks.channelId, resolved.channelId))
    .orderBy(asc(channelBookmarks.position), asc(channelBookmarks.createdAt));

  return NextResponse.json({ bookmarks: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const resolved = await requireMember(param, user.id);
  if ("error" in resolved) return resolved.error;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const emoji = typeof body.emoji === "string" && body.emoji.trim() ? body.emoji.trim() : "🔖";

  if (!title || !url) {
    return NextResponse.json({ error: "title and url are required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const [{ maxPos }] = await db
    .select({ maxPos: max(channelBookmarks.position) })
    .from(channelBookmarks)
    .where(eq(channelBookmarks.channelId, resolved.channelId));

  const [bookmark] = await db
    .insert(channelBookmarks)
    .values({
      channelId: resolved.channelId,
      title,
      url,
      emoji,
      position: (maxPos ?? 0) + 1,
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json({ bookmark }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const resolved = await requireMember(param, user.id);
  if ("error" in resolved) return resolved.error;

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.url === "string") {
    try {
      new URL(body.url.trim());
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    updates.url = body.url.trim();
  }
  if (typeof body.emoji === "string") updates.emoji = body.emoji.trim() || "🔖";
  if (typeof body.position === "number") updates.position = body.position;

  const [updated] = await db
    .update(channelBookmarks)
    .set(updates)
    .where(and(eq(channelBookmarks.id, id), eq(channelBookmarks.channelId, resolved.channelId)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ bookmark: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId: param } = await params;
  const resolved = await requireMember(param, user.id);
  if ("error" in resolved) return resolved.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await db
    .delete(channelBookmarks)
    .where(and(eq(channelBookmarks.id, id), eq(channelBookmarks.channelId, resolved.channelId)));

  return NextResponse.json({ success: true });
}
