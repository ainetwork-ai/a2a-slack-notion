import { db } from "@/lib/db";
import { workflowRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workflowId } = await params;

  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId))
    .orderBy(desc(workflowRuns.startedAt))
    .limit(20);

  return NextResponse.json(runs);
}
