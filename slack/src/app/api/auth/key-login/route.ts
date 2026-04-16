import { NextRequest, NextResponse } from "next/server";
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
 * POST /api/auth/key-login
 *
 *   body: { privateKey: string, displayName?: string }
 *
 * Derives the AIN address from the supplied private key, signs the standard
 * sign-in challenge server-side, and creates/updates the corresponding user.
 * Equivalent to the wallet-popup flow but uses a key the caller already has —
 * useful for scripted access, CLIs, and "1Password-style" key vaults that fill
 * the field on the user's behalf.
 *
 * The private key never persists. The session cookie is the same iron-session
 * one the wallet flow issues.
 */
export async function POST(req: NextRequest) {
  try {
    const { privateKey, displayName } = await req.json();

    if (typeof privateKey !== "string" || privateKey.length < 32) {
      return NextResponse.json(
        { error: "privateKey is required (hex string, 32+ bytes)" },
        { status: 400 }
      );
    }

    // Derive AIN address by adding the key to a transient wallet
    let address: string;
    try {
      const Ain = (await import("@ainblockchain/ain-js")).default;
      const ain = new Ain("https://devnet-api.ainetwork.ai", null, 0);
      const cleanKey = privateKey.startsWith("0x")
        ? privateKey.slice(2)
        : privateKey;
      address = ain.wallet.add(cleanKey);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Invalid private key",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Find or create user
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
          displayName: displayName || `User-${address.slice(0, 8)}`,
          status: "online",
        })
        .returning();
      user = created;

      // Auto-join all public channels (mirror /api/auth/verify behavior)
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

      // Join the default workspace if present
      const [defaultWs] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, "slack-a2a"))
        .limit(1);

      if (defaultWs) {
        await db
          .insert(workspaceMembers)
          .values({ workspaceId: defaultWs.id, userId: user.id, role: "member" })
          .onConflictDoNothing();

        const [generalChannel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(
            and(
              eq(channels.workspaceId, defaultWs.id),
              eq(channels.name, "general"),
              eq(channels.isPrivate, false)
            )
          )
          .limit(1);

        if (generalChannel) {
          await db
            .insert(channelMembers)
            .values({
              channelId: generalChannel.id,
              userId: user.id,
              role: "member",
            })
            .onConflictDoNothing();
        }
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
