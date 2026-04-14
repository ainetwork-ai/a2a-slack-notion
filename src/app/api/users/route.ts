import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const allUsers = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
    })
    .from(users)
    .where(eq(users.isAgent, false))
    .orderBy(users.displayName);

  return NextResponse.json({ users: allUsers });
}
