import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyEthSignature } from "@/lib/auth/eth-verify";
import { db } from "@/lib/db";
import { users, channels, channelMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { signature, address, displayName, provider } = body;
  console.log("[Auth:Verify] Request:", { address, displayName, provider, hasSig: !!signature });

  const session = await getSession();
  console.log("[Auth:Verify] Session challenge:", session.challenge ? "present" : "missing");

  if (!session.challenge) {
    console.error("[Auth:Verify] No challenge in session");
    return NextResponse.json({ error: "No challenge found. Please try again." }, { status: 400 });
  }

  const message = `Sign in to Slack-A2A: ${session.challenge}`;

  let valid = false;

  if (provider === "metamask" || provider === "eth") {
    console.log("[Auth:Verify] Verifying ETH signature...");
    try {
      valid = await verifyEthSignature(message, signature, address);
    } catch (e) {
      console.error("[Auth:Verify] ETH verify error:", e);
      valid = false;
    }
  } else {
    console.log("[Auth:Verify] Verifying AIN signature...");
    try {
      const { verifyAinSignature } = await import("@/lib/auth/ain-verify");
      valid = verifyAinSignature(message, signature, address);
    } catch (e) {
      console.error("[Auth:Verify] AIN verify error:", e);
      valid = false;
    }
  }

  console.log("[Auth:Verify] Signature valid:", valid);

  if (!valid) {
    console.error("[Auth:Verify] Invalid signature for address:", address);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const normalizedAddress = address.toLowerCase();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.ainAddress, normalizedAddress))
    .limit(1);

  let user;
  if (existing) {
    console.log("[Auth:Verify] Existing user found:", existing.id, existing.displayName);
    user = existing;
  } else {
    console.log("[Auth:Verify] Creating new user:", normalizedAddress, displayName);
    const [created] = await db
      .insert(users)
      .values({
        ainAddress: normalizedAddress,
        displayName: displayName || `User-${address.slice(0, 8)}`,
        status: "online",
      })
      .returning();
    user = created;

    // Auto-join all public channels for new users
    const publicChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.isPrivate, false));

    console.log("[Auth:Verify] Auto-joining", publicChannels.length, "channels");
    for (const ch of publicChannels) {
      await db
        .insert(channelMembers)
        .values({ channelId: ch.id, userId: user.id, role: "member" })
        .onConflictDoNothing();
    }
  }

  session.userId = user.id;
  session.ainAddress = user.ainAddress;
  session.challenge = undefined;
  await session.save();

  console.log("[Auth:Verify] Login success! User:", user.id, user.displayName);
  return NextResponse.json({ user });
}
