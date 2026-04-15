import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { channelFolders, channelMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// PATCH /api/channel-folders/[folderId]/channels
// Body: { channelId: string } — moves the channel into this folder
// To remove from a folder, use folderId "none": PATCH /api/channel-folders/none/channels
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ folderId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { folderId } = await params;
  const body = await request.json();
  const { channelId } = body as { channelId?: string };

  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  // Validate folder ownership (unless removing from folder)
  if (folderId !== "none") {
    const [folder] = await db
      .select()
      .from(channelFolders)
      .where(
        and(eq(channelFolders.id, folderId), eq(channelFolders.userId, user.id))
      )
      .limit(1);

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
  }

  // Verify the user is a member of this channel
  const [membership] = await db
    .select()
    .from(channelMembers)
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.userId, user.id)
      )
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this channel" }, { status: 403 });
  }

  const [updated] = await db
    .update(channelMembers)
    .set({ folderId: folderId === "none" ? null : folderId })
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.userId, user.id)
      )
    )
    .returning();

  return NextResponse.json(updated);
}
