import { db } from "@/lib/db";
import { channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { channelId } = await params;

  // Capture previous lastReadAt before updating
  const [membership] = await db
    .select({ lastReadAt: channelMembers.lastReadAt })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)))
    .limit(1);

  const previousLastReadAt = membership?.lastReadAt ?? null;

  await db
    .update(channelMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id))
    );

  return NextResponse.json({ success: true, previousLastReadAt });
}
