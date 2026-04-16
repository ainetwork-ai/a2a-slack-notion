import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workflowRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resumeWorkflow } from "@/lib/workflow/executor";
import type { PendingInput } from "@/lib/workflow/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string; runId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { runId } = await params;

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "paused") {
    return NextResponse.json({ error: "Run is not paused" }, { status: 400 });
  }

  const pendingInput = run.pendingInput as PendingInput | null;
  if (!pendingInput) {
    return NextResponse.json({ error: "No pending input" }, { status: 400 });
  }

  // Validate that the submitter matches expectedFrom
  if (pendingInput.expectedFrom !== "unknown" && pendingInput.expectedFrom !== user.id) {
    return NextResponse.json({ error: "Not authorized to submit this form" }, { status: 403 });
  }

  let body: { formData?: Record<string, unknown>; decision?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let mergeVariables: Record<string, unknown> = {};

  if (pendingInput.type === "form" && body.formData) {
    // Store form data under "form" namespace
    mergeVariables = { form: body.formData };
  } else if (pendingInput.type === "approval" && body.decision) {
    const decision = body.decision.toLowerCase();
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json(
        { error: "Decision must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }
    mergeVariables = { approval: decision };
  } else {
    return NextResponse.json(
      { error: "Missing formData or decision in request body" },
      { status: 400 }
    );
  }

  try {
    await resumeWorkflow(runId, mergeVariables);
    return NextResponse.json({ status: "resumed" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resume workflow" },
      { status: 500 }
    );
  }
}
