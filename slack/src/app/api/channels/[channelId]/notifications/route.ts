import { db } from "@/lib/db";
import { channelMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { channelId } = await params;

  const [member] = await db
    .select({ notificationPref: channelMembers.notificationPref })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, auth.user.id)));

  return NextResponse.json({ pref: member?.notificationPref ?? "all" });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { channelId } = await params;
  const body = await request.json();

  const pref = body.pref;
  if (!["all", "mentions", "none"].includes(pref)) {
    return NextResponse.json({ error: "Invalid pref. Must be all, mentions, or none" }, { status: 400 });
  }

  await db
    .update(channelMembers)
    .set({ notificationPref: pref })
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, auth.user.id)));

  return NextResponse.json({ pref });
}
