import { db } from "@/lib/db";
import { workflowRuns, workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string; runId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { runId } = await params;

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, run.workflowId))
    .limit(1);

  return NextResponse.json({
    run,
    workflow,
  });
}
