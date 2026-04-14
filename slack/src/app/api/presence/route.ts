import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications, dmConversations, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  await db
    .update(users)
    .set({ status: "online", updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ status: "online" });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { statusMessage } = body;

  await db
    .update(users)
    .set({ statusMessage: statusMessage ?? "", updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ statusMessage });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json({ error: "ids query param is required" }, { status: 400 });
  }

  const ids = idsParam.split(",").filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  const presences = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      status: users.status,
      statusMessage: users.statusMessage,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(inArray(users.id, ids));

  return NextResponse.json(presences);
}
