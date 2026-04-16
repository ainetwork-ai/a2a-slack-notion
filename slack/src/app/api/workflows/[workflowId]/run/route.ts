import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/workflow/executor";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { workflowId } = await params;

  let initialVariables: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body.variables && typeof body.variables === "object") {
      initialVariables = body.variables;
    }
  } catch {
    // no body — use empty variables
  }

  try {
    const result = await runWorkflow(workflowId, initialVariables, user.id);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run workflow" },
      { status: 400 }
    );
  }
}
