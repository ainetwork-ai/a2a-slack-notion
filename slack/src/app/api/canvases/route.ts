import { db } from "@/lib/db";
import { canvases, channels, channelMembers, workspaceMembers } from "@/lib/db/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { channelId, conversationId, title, content } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!channelId && !conversationId) {
    return NextResponse.json({ error: "channelId or conversationId is required" }, { status: 400 });
  }

  // Resolve workspaceId from channelId
  let workspaceId: string | null = null;
  if (channelId) {
    const [ch] = await db
      .select({ workspaceId: channels.workspaceId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    workspaceId = ch?.workspaceId ?? null;
  } else {
    // For DMs, get workspaceId from user membership
    const [wm] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1);
    workspaceId = wm?.workspaceId ?? null;
  }

  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const [canvas] = await db
    .insert(canvases)
    .values({
      channelId: channelId ?? null,
      conversationId: conversationId ?? null,
      workspaceId,
      title: title.trim(),
      content: content ?? "",
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json(canvas, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const q = searchParams.get("q");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Verify user is a member of the workspace
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
  }

  const conditions = [eq(canvases.workspaceId, workspaceId)];
  if (q) {
    conditions.push(or(ilike(canvases.title, `%${q}%`), ilike(canvases.content, `%${q}%`))!);
  }

  const results = await db
    .select()
    .from(canvases)
    .where(and(...conditions))
    .limit(50);

  return NextResponse.json(results);
}
