/**
 * GET /api/channels/:channelId/canvases
 *
 * Returns canvases for a channel with pagination and search.
 * Query params: ?q=&limit=&cursor=
 * Returns { canvases: [], nextCursor?: string }
 */

import { db } from "@/lib/db";
import { canvases, channelMembers, users } from "@/lib/db/schema";
import { eq, and, desc, lt, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}:${id}`).toString("base64");
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) return null;
    const updatedAt = new Date(raw.slice(0, colonIdx));
    const id = raw.slice(colonIdx + 1);
    if (isNaN(updatedAt.getTime()) || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;

    const { channelId } = await params;

    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, auth.user.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100);
    const cursorParam = searchParams.get("cursor");

    const conditions: ReturnType<typeof eq>[] = [eq(canvases.channelId, channelId)];

    if (q) {
      conditions.push(
        or(
          ilike(canvases.title, `%${q}%`),
          ilike(canvases.topic, `%${q}%`)
        ) as ReturnType<typeof eq>
      );
    }

    if (cursorParam) {
      const decoded = decodeCursor(cursorParam);
      if (decoded) {
        conditions.push(
          or(
            lt(canvases.updatedAt, decoded.updatedAt),
            and(eq(canvases.updatedAt, decoded.updatedAt), lt(canvases.id, decoded.id))!
          ) as ReturnType<typeof eq>
        );
      }
    }

    // Explicit column list — avoid bare `.select()` which would emit every
    // schema column including `page_id`, which migration 0010 adds but may
    // not yet exist in every environment.
    const rows = await db
      .select({
        id: canvases.id,
        title: canvases.title,
        topic: canvases.topic,
        pipelineStatus: canvases.pipelineStatus,
        pipelineRunId: canvases.pipelineRunId,
        updatedAt: canvases.updatedAt,
        createdAt: canvases.createdAt,
        updatedByName: users.displayName,
      })
      .from(canvases)
      .leftJoin(users, eq(canvases.updatedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(canvases.updatedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const canvasList = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && canvasList.length > 0
        ? encodeCursor(canvasList[canvasList.length - 1].updatedAt, canvasList[canvasList.length - 1].id)
        : undefined;

    return NextResponse.json({ canvases: canvasList, ...(nextCursor ? { nextCursor } : {}) });
  } catch (err) {
    console.error("[canvases GET]", err);
    return NextResponse.json(
      { error: "Failed to list canvases", detail: String(err) },
      { status: 500 }
    );
  }
}
