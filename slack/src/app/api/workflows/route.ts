import { db } from "@/lib/db";
import { workflows, workflowRuns } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceIdQuery, resolveWorkspaceParam } from "@/lib/resolve";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const workspaceId = await resolveWorkspaceIdQuery(request);

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
  const {
    name,
    description,
    triggerType,
    triggerConfig,
    steps,
    workspaceId: workspaceRef,
  } = body;

  if (!name || !triggerType || !workspaceRef) {
    return NextResponse.json(
      { error: "name, triggerType, and workspaceId are required" },
      { status: 400 }
    );
  }

  const ws = await resolveWorkspaceParam(String(workspaceRef));
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const [workflow] = await db
    .insert(workflows)
    .values({
      name,
      description: description ?? null,
      triggerType,
      triggerConfig: triggerConfig ?? {},
      steps: steps ?? [],
      workspaceId: ws.id,
      createdBy: user.id,
      enabled: true,
    })
    .returning();

  return NextResponse.json(workflow, { status: 201 });
}
