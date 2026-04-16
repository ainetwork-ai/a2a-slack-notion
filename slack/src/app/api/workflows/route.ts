import { db } from "@/lib/db";
import { workflows, workflowRuns } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.workspaceId, workspaceId))
    .orderBy(desc(workflows.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { name, description, triggerType, triggerConfig, steps, workspaceId } = body;

  if (!name || !triggerType || !workspaceId) {
    return NextResponse.json(
      { error: "name, triggerType, and workspaceId are required" },
      { status: 400 }
    );
  }

  const [workflow] = await db
    .insert(workflows)
    .values({
      name,
      description: description ?? null,
      triggerType,
      triggerConfig: triggerConfig ?? {},
      steps: steps ?? [],
      workspaceId,
      createdBy: user.id,
      enabled: true,
    })
    .returning();

  return NextResponse.json(workflow, { status: 201 });
}
