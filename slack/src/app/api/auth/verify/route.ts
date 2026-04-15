import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyEthSignature } from "@/lib/auth/eth-verify";
import { db } from "@/lib/db";
import { users, channels, channelMembers, workspaces, workspaceMembers, inviteTokens } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { eq, and, gt } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
  const body = await req.json();
  const { signature, address, displayName, provider, inviteToken } = body;
  console.log("[Auth:Verify] Request:", { address, displayName, provider, hasSig: !!signature, hasInvite: !!inviteToken });

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

  // Resolve which workspace to join
  let targetWorkspaceId: string | null = null;

  if (inviteToken) {
    // Look up the invite token in DB
    const [invite] = await db
      .select({
        workspaceId: inviteTokens.workspaceId,
        expiresAt: inviteTokens.expiresAt,
      })
      .from(inviteTokens)
      .where(
        and(
          eq(inviteTokens.token, inviteToken),
          gt(inviteTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (invite) {
      targetWorkspaceId = invite.workspaceId;
      console.log("[Auth:Verify] Joining workspace from invite token:", targetWorkspaceId);
    }
  }

  if (!targetWorkspaceId) {
    // Fall back to default workspace
    const [defaultWs] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, "slack-a2a"))
      .limit(1);
    targetWorkspaceId = defaultWs?.id ?? null;
  }

  if (targetWorkspaceId) {
    // Load workspace to get defaults
    const [targetWorkspace] = await db
      .select({
        id: workspaces.id,
        defaultNotificationPref: workspaces.defaultNotificationPref,
        defaultChannels: workspaces.defaultChannels,
      })
      .from(workspaces)
      .where(eq(workspaces.id, targetWorkspaceId))
      .limit(1);

    await db
      .insert(workspaceMembers)
      .values({ workspaceId: targetWorkspaceId, userId: user.id, role: "member" })
      .onConflictDoNothing();

    const defaultNotifPref = targetWorkspace?.defaultNotificationPref ?? "all";
    const defaultChannelIds: string[] = (targetWorkspace?.defaultChannels as string[] | null) ?? [];

    // Auto-join the #general channel of the workspace
    const [generalChannel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.workspaceId, targetWorkspaceId),
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
          notificationPref: defaultNotifPref,
        })
        .onConflictDoNothing();
    }

    // Join default channels configured on the workspace
    if (defaultChannelIds.length > 0) {
      const defaultChans = await db
        .select({ id: channels.id })
        .from(channels)
        .where(
          and(
            eq(channels.workspaceId, targetWorkspaceId),
            inArray(channels.id, defaultChannelIds)
          )
        );

      for (const ch of defaultChans) {
        if (ch.id === generalChannel?.id) continue;
        await db
          .insert(channelMembers)
          .values({
            channelId: ch.id,
            userId: user.id,
            role: "member",
            notificationPref: defaultNotifPref,
          })
          .onConflictDoNothing();
      }
    }
  }

  session.userId = user.id;
  session.ainAddress = user.ainAddress;
  session.challenge = undefined;
  await session.save();

  console.log("[Auth:Verify] Login success! User:", user.id, user.displayName);
  return NextResponse.json({ user });
  } catch (err) {
    console.error("[Auth:Verify] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error", details: String(err) }, { status: 500 });
  }
}
