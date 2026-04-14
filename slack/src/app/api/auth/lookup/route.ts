import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ user: null });
  }

  const [user] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.ainAddress, address.toLowerCase()))
    .limit(1);

  return NextResponse.json({ user: user || null });
}
