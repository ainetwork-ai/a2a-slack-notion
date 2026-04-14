import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyEthSignature } from "@/lib/auth/eth-verify";
import { db } from "@/lib/db";
import { users, channels, channelMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { signature, address, displayName, provider } = await req.json();
  const session = await getSession();

  if (!session.challenge) {
    return NextResponse.json({ error: "No challenge found" }, { status: 400 });
  }

  const message = `Sign in to Slack-A2A: ${session.challenge}`;

  let valid = false;

  if (provider === "metamask" || provider === "eth") {
    valid = await verifyEthSignature(message, signature, address);
  } else {
    // AIN wallet verification
    try {
      const { verifyAinSignature } = await import("@/lib/auth/ain-verify");
      valid = verifyAinSignature(message, signature, address);
    } catch {
      valid = false;
    }
  }

  if (!valid) {
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
    user = existing;
  } else {
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

  return NextResponse.json({ user });
}
