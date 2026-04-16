import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export async function logAudit(
  workspaceId: string,
  userId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId,
      userId: userId ?? undefined,
      action,
      targetType,
      targetId: targetId ?? undefined,
      metadata: metadata ?? undefined,
    });
  } catch {
    // Audit logging is non-critical — swallow errors so callers are not disrupted
  }
}
