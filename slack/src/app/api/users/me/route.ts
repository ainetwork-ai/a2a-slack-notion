import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { onUserUpdated } from "@/lib/search/hooks";

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { displayName, avatarUrl, timezone } = body;

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof displayName === "string" && displayName.trim().length > 0) {
    updates.displayName = displayName.trim();
  }
  if (typeof avatarUrl === "string") {
    updates.avatarUrl = avatarUrl.trim() || null;
  }
  if (typeof timezone === "string" && timezone.trim().length > 0) {
    updates.timezone = timezone.trim();
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      ainAddress: users.ainAddress,
      isAgent: users.isAgent,
    });

  // Update search index (best-effort)
  onUserUpdated({
    id: updated.id,
    displayName: updated.displayName,
    ainAddress: updated.ainAddress,
    isAgent: updated.isAgent,
  });

  return NextResponse.json({ user: updated });
}
