import { db } from "@/lib/db";
import { blockedUsers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

// GET /api/users/block - list blocked users
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const blocked = await db
    .select({ blockedUserId: blockedUsers.blockedUserId, createdAt: blockedUsers.createdAt })
    .from(blockedUsers)
    .where(eq(blockedUsers.userId, user.id));

  return NextResponse.json({ blockedUsers: blocked });
}

// POST /api/users/block - block a user
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { blockedUserId } = await request.json();
  if (!blockedUserId) {
    return NextResponse.json({ error: "blockedUserId required" }, { status: 400 });
  }
  if (blockedUserId === user.id) {
    return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });
  }

  try {
    await db.insert(blockedUsers).values({ userId: user.id, blockedUserId }).onConflictDoNothing();
  } catch {
    return NextResponse.json({ error: "Failed to block user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/users/block - unblock a user
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { blockedUserId } = await request.json();
  if (!blockedUserId) {
    return NextResponse.json({ error: "blockedUserId required" }, { status: 400 });
  }

  await db
    .delete(blockedUsers)
    .where(and(eq(blockedUsers.userId, user.id), eq(blockedUsers.blockedUserId, blockedUserId)));

  return NextResponse.json({ success: true });
}
