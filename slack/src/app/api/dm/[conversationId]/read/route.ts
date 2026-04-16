import { db } from "@/lib/db";
import { dmMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { conversationId } = await params;

  // Capture previous lastReadAt before updating
  const [membership] = await db
    .select({ lastReadAt: dmMembers.lastReadAt })
    .from(dmMembers)
    .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)))
    .limit(1);

  const previousLastReadAt = membership?.lastReadAt ?? null;

  await db
    .update(dmMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id))
    );

  return NextResponse.json({ success: true, previousLastReadAt });
}
