import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db";
import { users, channels, channelMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// In-memory invite store (in production, use DB)
const invites = new Map<string, { createdBy: string; createdAt: Date; expiresAt: Date }>();

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const token = randomUUID().slice(0, 8);
  invites.set(token, {
    createdBy: auth.user.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  const baseUrl = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004";
  const link = `${baseUrl}/login?invite=${token}`;

  return NextResponse.json({ token, link, expiresAt: invites.get(token)!.expiresAt });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const invite = invites.get(token);
  if (!invite || invite.expiresAt < new Date()) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true, expiresAt: invite.expiresAt });
}
