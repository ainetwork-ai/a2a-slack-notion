/**
 * notion_advance_status step handler
 *
 * Advances a canvas's pipeline status to nextStatus using
 * setPipelineStatus from @/lib/notion/pipeline-status, which
 * dual-writes to canvases.pipelineStatus and blocks.properties.
 */

import { setPipelineStatus, isValidStatus } from "@/lib/notion/pipeline-status";
import type { PipelineStatus } from "@/lib/notion/pipeline-status";

export interface NotionAdvanceStatusInput {
  canvasId: string;
  nextStatus: string;
}

export interface NotionAdvanceStatusOutput {
  ok: true;
  canvasId: string;
  status: PipelineStatus;
}

export interface NotionAdvanceStatusError {
  ok: false;
  error: string;
}

export async function handleNotionAdvanceStatus(
  input: NotionAdvanceStatusInput
): Promise<NotionAdvanceStatusOutput | NotionAdvanceStatusError> {
  try {
    const { canvasId, nextStatus } = input;

    if (!isValidStatus(nextStatus)) {
      return {
        ok: false,
        error: `Invalid status "${nextStatus}". Must be one of: draft, edited, fact-checked, published`,
      };
    }

    await setPipelineStatus(canvasId, nextStatus);

    return { ok: true, canvasId, status: nextStatus };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
