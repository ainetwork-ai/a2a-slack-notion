import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      iconText: workspaces.iconText,
      description: workspaces.description,
      createdAt: workspaces.createdAt,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, auth.user.id));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { name, slug, iconText } = body as {
    name?: string;
    slug?: string;
    iconText?: string;
  };

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Workspace slug is required" }, { status: 400 });
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      iconText: iconText?.trim().slice(0, 3) || name.slice(0, 2).toUpperCase(),
      createdBy: auth.user.id,
    })
    .returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: auth.user.id,
    role: "owner",
  });

  return NextResponse.json(workspace, { status: 201 });
}
