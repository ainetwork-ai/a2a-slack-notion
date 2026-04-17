import { db } from "@/lib/db";
import { pageTemplates, workspaceMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceParam } from "@/lib/resolve";

async function checkMembership(workspaceId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return membership ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const workspaceRef = searchParams.get("workspaceId");

  if (!workspaceRef) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const ws = await resolveWorkspaceParam(workspaceRef);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const membership = await checkMembership(ws.id, user.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
  }

  const templates = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.workspaceId, ws.id))
    .orderBy(pageTemplates.createdAt);

  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { workspaceId: workspaceRef, name, description, icon, category, content } = body;

  if (!workspaceRef) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const ws = await resolveWorkspaceParam(workspaceRef);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const membership = await checkMembership(ws.id, user.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
  }

  const [template] = await db
    .insert(pageTemplates)
    .values({
      workspaceId: ws.id,
      name: name.trim(),
      description: description ?? null,
      icon: icon ?? null,
      category: category ?? "custom",
      content: content ?? [],
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json(template, { status: 201 });
}
