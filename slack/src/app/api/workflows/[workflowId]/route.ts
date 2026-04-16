import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workflowId } = await params;

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json(workflow);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workflowId } = await params;
  const body = await request.json();

  const allowed = ["name", "description", "triggerType", "triggerConfig", "steps", "enabled"] as const;
  const updates: Partial<typeof body> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(workflows)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(workflows.id, workflowId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { workflowId } = await params;

  const [deleted] = await db
    .delete(workflows)
    .where(eq(workflows.id, workflowId))
    .returning({ id: workflows.id });

  if (!deleted) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
