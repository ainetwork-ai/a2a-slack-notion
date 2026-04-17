/**
 * GET /api/channels/:channelId/canvases
 *
 * Returns all canvases for a channel (multiple per channel, one per article),
 * sorted newest-first. Requires channel membership.
 */

import { db } from "@/lib/db";
import { canvases, channelMembers, users } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
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

  const rows = await db
    .select({
      id: canvases.id,
      title: canvases.title,
      topic: canvases.topic,
      pipelineStatus: canvases.pipelineStatus,
      updatedAt: canvases.updatedAt,
      createdAt: canvases.createdAt,
      updatedByName: users.displayName,
    })
    .from(canvases)
    .leftJoin(users, eq(canvases.updatedBy, users.id))
    .where(eq(canvases.channelId, channelId))
    .orderBy(desc(canvases.updatedAt))
    .limit(50);

  return NextResponse.json(rows);
}
