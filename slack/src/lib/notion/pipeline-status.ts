/**
 * Single source of truth for canvas pipeline status.
 *
 * During the migration window, pipeline status lives in two places:
 *   - Legacy:  canvases.pipelineStatus  (always present)
 *   - New:     blocks.properties.status  (present when canvas.pageId is set)
 *
 * Reads prefer the page-backed value; writes dual-write to keep both in sync.
 */

import { db } from "@/lib/db";
import { canvases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStatus = "draft" | "edited" | "fact-checked" | "published";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PIPELINE_STAGES: readonly {
  key: PipelineStatus;
  label: string;
  order: number;
}[] = [
  { key: "draft", label: "Drafting", order: 0 },
  { key: "edited", label: "Editing", order: 1 },
  { key: "fact-checked", label: "Fact-checked", order: 2 },
  { key: "published", label: "Published", order: 3 },
] as const;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Narrows an unknown value to PipelineStatus. */
export function isValidStatus(value: unknown): value is PipelineStatus {
  return (
    value === "draft" ||
    value === "edited" ||
    value === "fact-checked" ||
    value === "published"
  );
}

// ---------------------------------------------------------------------------
// Stage helpers
// ---------------------------------------------------------------------------

function stageOrder(status: PipelineStatus | null): number {
  if (status === null) return -1;
  return PIPELINE_STAGES.find((s) => s.key === status)?.order ?? -1;
}

/**
 * Returns true when advancing from `current` to `next` is allowed without
 * admin override.
 *
 * Rules:
 *   - null → any stage is allowed (initial assignment).
 *   - Forward advance (order increases by any amount) is allowed.
 *   - Backward movement or same-stage is NOT allowed without override.
 *   - Skipping stages is allowed (e.g. draft → published); admin override
 *     is only required for backward movement.
 */
export function canAdvance(
  current: PipelineStatus | null,
  next: PipelineStatus
): boolean {
  const currentOrder = stageOrder(current);
  const nextOrder = stageOrder(next);
  // Allow if next is strictly later than current (or current is null)
  return nextOrder > currentOrder;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returns the effective pipeline status for a canvas, preferring the
 * page-backed value when `pageId` is set.
 *
 * @param canvas  - Canvas row (or minimal shape containing the two fields).
 * @param page    - Optional page block row (only its properties.status is read).
 */
export function getEffectiveStatus(
  canvas: { pipelineStatus: PipelineStatus | null; pageId?: string | null },
  page?: { properties: { status?: PipelineStatus } } | null
): PipelineStatus | null {
  // Prefer page-backed status when the canvas has a linked page
  if (canvas.pageId && page?.properties?.status) {
    return page.properties.status;
  }
  return canvas.pipelineStatus ?? null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Dual-writes `status` to:
 *   1. canvases.pipelineStatus  (always)
 *   2. blocks.properties (JSONB merge) when the canvas has a pageId
 *
 * Both writes happen inside a single transaction so they are atomic.
 */
export async function setPipelineStatus(
  canvasId: string,
  status: PipelineStatus | null
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Update legacy column — always
    const [updated] = await tx
      .update(canvases)
      .set({ pipelineStatus: status })
      .where(eq(canvases.id, canvasId))
      .returning({
        pageId: sql<string | null>`(canvases.page_id)`.as("pageId"),
      });

    if (!updated) return; // canvas not found — nothing to do

    const pageId = updated.pageId as string | null;

    // 2. Sync to blocks.properties when a linked page exists
    if (pageId) {
      if (status === null) {
        // Remove the status key from properties rather than setting it to null
        await tx.execute(
          sql`
            UPDATE blocks
            SET properties = properties - 'status'
            WHERE id = ${pageId}
              AND type = 'page'
          `
        );
      } else {
        await tx.execute(
          sql`
            UPDATE blocks
            SET properties = jsonb_set(
              COALESCE(properties, '{}'::jsonb),
              '{status}',
              ${JSON.stringify(status)}::jsonb
            )
            WHERE id = ${pageId}
              AND type = 'page'
          `
        );
      }
    }
  });
}
