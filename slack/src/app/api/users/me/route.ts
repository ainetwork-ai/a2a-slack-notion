import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { displayName, avatarUrl } = body;

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    updates.displayName = displayName.trim();
  }
  if (typeof avatarUrl === "string") {
    updates.avatarUrl = avatarUrl.trim() || null;
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    });

  return NextResponse.json({ user: updated });
}
