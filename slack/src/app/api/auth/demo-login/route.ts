import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  users,
  channels,
  channelMembers,
  workspaces,
  workspaceMembers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/auth/demo-login
 *
 * Logs the caller in as the shared "DemoUser" so visitors can try the app
 * without setting up MetaMask or a wallet. Uses a fixed demo private key
 * (public — same one already in docs/demo/record.mjs) to derive the AIN
 * address; everyone who clicks "Try demo" lands on the same account.
 *
 * The key can be overridden via env DEMO_PRIVATE_KEY for a future private
 * demo account. The button on /login calls this endpoint directly.
 */
const FALLBACK_DEMO_KEY =
  "b796e8971f2c5c909a2178fb3fc1970f317adb1e9237d950d8fcdd5f5e1d7e42";

export async function POST() {
  try {
    const privateKey = process.env.DEMO_PRIVATE_KEY || FALLBACK_DEMO_KEY;

    let address: string;
    try {
      const Ain = (await import("@ainblockchain/ain-js")).default;
      const ain = new Ain("https://devnet-api.ainetwork.ai", null, 0);
      const clean = privateKey.startsWith("0x")
        ? privateKey.slice(2)
        : privateKey;
      address = ain.wallet.add(clean);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Demo login unavailable",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 500 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.ainAddress, normalizedAddress))
      .limit(1);

    if (!user) {
      const [created] = await db
        .insert(users)
        .values({
          ainAddress: normalizedAddress,
          displayName: "DemoUser",
          status: "online",
        })
        .returning();
      user = created;
    }

    // Every demo visit: re-join the user to every public, non-archived
    // channel in the default workspace (and also ensure workspace membership).
    // Without this an existing DemoUser who was previously removed from a
    // channel would see an empty sidebar — we want demo visitors to always
    // land in the full workspace.
    const [defaultWs] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, "Slack-A2A"))
      .limit(1);

    if (defaultWs) {
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: defaultWs.id, userId: user.id, role: "member" })
        .onConflictDoNothing();

      const wsChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(
          and(
            eq(channels.workspaceId, defaultWs.id),
            eq(channels.isPrivate, false),
            eq(channels.isArchived, false)
          )
        );

      for (const ch of wsChannels) {
        await db
          .insert(channelMembers)
          .values({ channelId: ch.id, userId: user.id, role: "member" })
          .onConflictDoNothing();
      }
    }

    const session = await getSession();
    session.userId = user.id;
    session.ainAddress = user.ainAddress;
    session.challenge = undefined;
    await session.save();

    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        ainAddress: user.ainAddress,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}
