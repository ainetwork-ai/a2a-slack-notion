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

  const [membership] = await db
    .select({ isMuted: dmMembers.isMuted })
    .from(dmMembers)
    .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const newMuted = !membership.isMuted;

  await db
    .update(dmMembers)
    .set({ isMuted: newMuted })
    .where(and(eq(dmMembers.conversationId, conversationId), eq(dmMembers.userId, user.id)));

  return NextResponse.json({ isMuted: newMuted });
}
