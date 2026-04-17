import { db } from "@/lib/db";
import { canvases, channelMembers, users, blocks } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { resolveChannelParam } from "@/lib/resolve";

// Explicit column list for canvases reads/writes. Drizzle's bare `.select()` /
// `.returning()` emit every column in the schema — listing columns we actually
// use keeps these routes safe during migration drift.
const canvasColumns = {
  id: canvases.id,
  channelId: canvases.channelId,
  conversationId: canvases.conversationId,
  workspaceId: canvases.workspaceId,
  title: canvases.title,
  content: canvases.content,
  createdBy: canvases.createdBy,
  updatedBy: canvases.updatedBy,
  createdAt: canvases.createdAt,
  updatedAt: canvases.updatedAt,
  pipelineStatus: canvases.pipelineStatus,
  topic: canvases.topic,
  pipelineRunId: canvases.pipelineRunId,
  pageId: canvases.pageId,
} as const;

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
      .select(canvasColumns)
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
  } catch (err) {
    console.error("[canvas GET]", err);
    return NextResponse.json(
      { error: "Failed to load canvas", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const { channelId: param } = await params;
    const resolvedChannel = await resolveChannelParam(param, user.id);
    if (!resolvedChannel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    const channelId = resolvedChannel.id;

    // Check membership
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Use resolved channel workspace/name directly
    const workspaceId = resolvedChannel.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Count existing canvases so each new one gets a unique default title (#channel canvas N)
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(canvases)
      .where(eq(canvases.channelId, channelId));

    const body = await request.json().catch(() => ({}));
    const defaultTitle = `#${resolvedChannel.name ?? 'channel'} canvas${existingCount > 0 ? ` ${existingCount + 1}` : ''}`;
    const title = body.title?.trim() || defaultTitle;

    // Create a Notion root page block and link the canvas to it so the block
    // editor (headings, bullets, slash commands, rich text) is usable right
    // after "+ New canvas". Without a pageId, NotionCanvasEditor falls back to
    // the legacy markdown textarea.
    const canvas = await db.transaction(async (tx) => {
      const [page] = await tx
        .insert(blocks)
        .values({
          type: "page",
          parentId: null,
          // page_id is NOT NULL and must point to itself; patched after insert.
          pageId: "00000000-0000-0000-0000-000000000000",
          workspaceId,
          properties: { title },
          content: {},
          childrenOrder: [],
          createdBy: user.id,
        })
        .returning({ id: blocks.id });

      await tx.update(blocks).set({ pageId: page.id }).where(eq(blocks.id, page.id));

      const [row] = await tx
        .insert(canvases)
        .values({
          channelId,
          workspaceId,
          title,
          content: "",
          createdBy: user.id,
          pageId: page.id,
        })
        .returning(canvasColumns);

      return row;
    });

    return NextResponse.json(canvas, { status: 201 });
  } catch (err) {
    console.error("[canvas POST]", err);
    return NextResponse.json(
      { error: "Failed to create canvas", detail: String(err) },
      { status: 500 }
    );
  }
}
