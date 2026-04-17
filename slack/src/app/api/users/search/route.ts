import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { ilike } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const q = new URL(request.url).searchParams.get("q") || "";

  const results = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      isAgent: users.isAgent,
      agentCategory: users.agentCategory,
      statusMessage: users.statusMessage,
    })
    .from(users)
    .where(ilike(users.displayName, `%${q}%`))
    .limit(20);

  return NextResponse.json(results);
}
