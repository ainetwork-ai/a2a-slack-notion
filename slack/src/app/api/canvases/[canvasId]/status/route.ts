import { db } from "@/lib/db";
import { canvases, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import {
  getEffectiveStatus,
  isValidStatus,
  canAdvance,
  setPipelineStatus,
} from "@/lib/notion/pipeline-status";
import type { PipelineStatus } from "@/lib/notion/pipeline-status";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Access helper (mirrors the pattern in canvases/[canvasId]/route.ts)
// ---------------------------------------------------------------------------

import { channelMembers } from "@/lib/db/schema";

async function canUserAccessCanvas(
  userId: string,
  canvas: typeof canvases.$inferSelect
): Promise<boolean> {
  if (canvas.channelId) {
    const [membership] = await db
      .select()
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.channelId, canvas.channelId),
          eq(channelMembers.userId, userId)
        )
      )
      .limit(1);
    return !!membership;
  }
  // For workspace-level or DM canvases, check workspace membership
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, canvas.workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  return !!wm;
}

// ---------------------------------------------------------------------------
// PATCH /api/canvases/:canvasId/status
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ canvasId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { canvasId } = await params;

  // Fetch canvas — include pageId via raw SQL since Agent K adds the column
  const rows = await db
    .select()
    .from(canvases)
    .where(eq(canvases.id, canvasId))
    .limit(1);

  const canvas = rows[0];
  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  const canAccess = await canUserAccessCanvas(user.id, canvas);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse body
  let body: { status?: unknown; override?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status: rawStatus, override } = body;

  // Validate status value — null is accepted (clears the status)
  if (rawStatus !== null && !isValidStatus(rawStatus)) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: draft, edited, fact-checked, published, or null`,
      },
      { status: 400 }
    );
  }

  const newStatus = rawStatus as PipelineStatus | null;

  // Resolve the current effective status.
  // pageId will be available once Agent K adds the column; fall back gracefully.
  const canvasAny = canvas as typeof canvas & { pageId?: string | null };
  const pageId: string | null = canvasAny.pageId ?? null;

  let pageProperties: { status?: PipelineStatus } | undefined;
  if (pageId) {
    // Fetch block properties if a page is linked
    const result = await db.execute<{ properties: { status?: PipelineStatus } }>(
      sql`SELECT properties FROM blocks WHERE id = ${pageId} AND type = 'page' LIMIT 1`
    );
    const blockRow = result.rows[0];
    pageProperties = blockRow?.properties;
  }

  const currentStatus = getEffectiveStatus(
    { pipelineStatus: canvas.pipelineStatus ?? null, pageId },
    pageProperties ? { properties: pageProperties } : null
  );

  // Advancement check
  if (newStatus !== null) {
    const isOverride = override === true;

    if (!canAdvance(currentStatus, newStatus)) {
      if (!isOverride) {
        return NextResponse.json(
          {
            error: `Cannot move from '${currentStatus ?? "none"}' to '${newStatus}'. Only forward advances are allowed without override.`,
          },
          { status: 422 }
        );
      }

      // Override requires workspace-admin role
      const [wm] = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, canvas.workspaceId),
            eq(workspaceMembers.userId, user.id)
          )
        )
        .limit(1);

      if (!wm || wm.role !== "admin") {
        return NextResponse.json(
          { error: "Admin role required to override pipeline stage advancement" },
          { status: 403 }
        );
      }
    }
  }

  // Perform dual-write
  await setPipelineStatus(canvasId, newStatus);

  // Return the updated effective status
  const effectiveStatus = getEffectiveStatus(
    { pipelineStatus: newStatus, pageId },
    newStatus !== null ? { properties: { status: newStatus } } : null
  );

  return NextResponse.json({ status: effectiveStatus });
}
