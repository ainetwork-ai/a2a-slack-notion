import { db } from "@/lib/db";
import { channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
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

  // Allow caller to supply a specific timestamp (e.g. "mark as unread from here")
  let newLastReadAt = new Date();
  try {
    const body = await request.json();
    if (body?.timestamp) {
      newLastReadAt = new Date(body.timestamp);
    }
  } catch {
    // no body or invalid JSON — use current time
  }

  await db
    .update(channelMembers)
    .set({ lastReadAt: newLastReadAt })
    .where(
      and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id))
    );

  return NextResponse.json({ success: true, previousLastReadAt });
}
