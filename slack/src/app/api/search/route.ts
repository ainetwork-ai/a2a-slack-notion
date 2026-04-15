import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, dmMembers } from "@/lib/db/schema";
import { eq, and, desc, isNotNull, lt, gt, inArray, or, ilike, SQL } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

interface ParsedQuery {
  text: string;
  from?: string;
  in?: string;
  hasLink?: boolean;
  hasPin?: boolean;
  before?: Date;
  after?: Date;
}

function parseSearchQuery(raw: string): ParsedQuery {
  const result: ParsedQuery = { text: '' };
  // Extract known operators, leave remaining text
  let remaining = raw;

  // from:username
  remaining = remaining.replace(/\bfrom:(\S+)/gi, (_, val) => {
    result.from = val;
    return '';
  });

  // in:channelname
  remaining = remaining.replace(/\bin:(\S+)/gi, (_, val) => {
    result.in = val;
    return '';
  });

  // has:link
  remaining = remaining.replace(/\bhas:link\b/gi, () => {
    result.hasLink = true;
    return '';
  });

  // has:pin
  remaining = remaining.replace(/\bhas:pin\b/gi, () => {
    result.hasPin = true;
    return '';
  });

  // before:YYYY-MM-DD
  remaining = remaining.replace(/\bbefore:(\d{4}-\d{2}-\d{2})\b/gi, (_, val) => {
    const d = new Date(val);
    if (!isNaN(d.getTime())) result.before = d;
    return '';
  });

  // after:YYYY-MM-DD
  remaining = remaining.replace(/\bafter:(\d{4}-\d{2}-\d{2})\b/gi, (_, val) => {
    const d = new Date(val);
    if (!isNaN(d.getTime())) result.after = d;
    return '';
  });

  result.text = remaining.trim();
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const channelIdFilter = searchParams.get("channelId");

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const parsed = parseSearchQuery(q.trim());
  const textPattern = parsed.text ? `%${parsed.text}%` : null;

  // Get channels the user is a member of
  const userChannelIds = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, user.id));

  const channelIds = userChannelIds.map((c) => c.channelId);

  // If channelId filter provided, scope to that channel only (if user is a member)
  if (channelIdFilter) {
    if (!channelIds.includes(channelIdFilter)) {
      return NextResponse.json({ results: [] });
    }

    const conditions: SQL[] = [eq(messages.channelId, channelIdFilter)];
    if (textPattern) conditions.push(ilike(messages.content, textPattern));
    if (parsed.hasPin) conditions.push(isNotNull(messages.pinnedAt));
    if (parsed.hasLink) conditions.push(ilike(messages.content, '%http%'));
    if (parsed.before) conditions.push(lt(messages.createdAt, parsed.before));
    if (parsed.after) conditions.push(gt(messages.createdAt, parsed.after));

    const results = await db
      .select({
        id: messages.id,
        content: messages.content,
        contentType: messages.contentType,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        channelId: messages.channelId,
        conversationId: messages.conversationId,
        parentId: messages.parentId,
        userId: messages.userId,
        user: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(50);

    const enriched = results.map(msg => ({
      ...msg,
      senderName: msg.user?.displayName ?? null,
      channel: { id: channelIdFilter, name: '' },
      conversation: null,
    }));
    return NextResponse.json({ results: enriched, textQuery: parsed.text });
  }

  // Get DM conversations the user is a member of
  const userConvIds = await db
    .select({ conversationId: dmMembers.conversationId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, user.id));

  const conversationIds = userConvIds.map((c) => c.conversationId);

  // Build message conditions
  const conditions: SQL[] = [];
  if (textPattern) conditions.push(ilike(messages.content, textPattern));
  if (parsed.hasPin) conditions.push(isNotNull(messages.pinnedAt));
  if (parsed.hasLink) conditions.push(ilike(messages.content, '%http%'));
  if (parsed.before) conditions.push(lt(messages.createdAt, parsed.before));
  if (parsed.after) conditions.push(gt(messages.createdAt, parsed.after));

  // If no text and no message-level conditions, only do channel/user searches unless operator forces messages
  const hasMessageOperators = parsed.hasPin || parsed.hasLink || parsed.before || parsed.after || parsed.from || parsed.in;

  // Location constraints
  const locationConditions: SQL[] = [];
  if (channelIds.length > 0) {
    locationConditions.push(inArray(messages.channelId, channelIds));
  }
  if (conversationIds.length > 0) {
    locationConditions.push(inArray(messages.conversationId, conversationIds));
  }

  if (locationConditions.length === 0 && !parsed.in) {
    // No accessible channels or DMs
    if (!parsed.in) {
      // Only return channel/user results based on text
      const allResults: Array<{
        id: string;
        type: 'channel' | 'message' | 'user';
        content: string;
        channelName?: string | null;
        senderName?: string | null;
        channelId?: string | null;
        createdAt?: Date | null;
      }> = [];

      if (textPattern) {
        const channelResults = await db
          .select({ id: channels.id, name: channels.name })
          .from(channels)
          .where(ilike(channels.name, textPattern))
          .limit(10);

        const userResults = await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(ilike(users.displayName, textPattern))
          .limit(10);

        allResults.push(
          ...channelResults.map(ch => ({
            id: ch.id,
            type: 'channel' as const,
            content: ch.name,
            channelName: ch.name,
            senderName: null,
            channelId: ch.id,
          })),
          ...userResults.map(u => ({
            id: u.id,
            type: 'user' as const,
            content: u.displayName,
            senderName: u.displayName,
          }))
        );
      }
      return NextResponse.json({ results: allResults, textQuery: parsed.text });
    }
  }

  // If in: operator provided, resolve channel ID by name
  let resolvedChannelIds = channelIds;
  if (parsed.in) {
    const matchedChannels = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(and(
        ilike(channels.name, `%${parsed.in}%`),
        channelIds.length > 0 ? inArray(channels.id, channelIds) : undefined
      ));
    resolvedChannelIds = matchedChannels.map(c => c.id);
    if (resolvedChannelIds.length === 0) {
      return NextResponse.json({ results: [], textQuery: parsed.text });
    }
    // Override location to only those channels
    conditions.push(inArray(messages.channelId, resolvedChannelIds));
  } else if (locationConditions.length > 0) {
    conditions.push(or(...locationConditions)!);
  }

  // If from: operator provided, filter by sender displayName
  if (parsed.from) {
    conditions.push(ilike(users.displayName, `%${parsed.from}%`));
  }

  // Only run message search if we have at least one filter condition or text
  let enriched: Array<{
    id: string;
    type: 'message';
    content: string;
    channelId: string | null;
    channelName: string | null;
    senderName: string | null;
    createdAt: Date;
  }> = [];

  if (conditions.length > 0 || hasMessageOperators) {
    const msgResults = await db
      .select({
        id: messages.id,
        content: messages.content,
        contentType: messages.contentType,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        channelId: messages.channelId,
        conversationId: messages.conversationId,
        parentId: messages.parentId,
        userId: messages.userId,
        user: {
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(messages.createdAt))
      .limit(50);

    // Enrich with channel/conversation info
    const enrichedRaw = await Promise.all(
      msgResults.map(async (msg) => {
        let channelInfo = null;
        if (msg.channelId) {
          const [ch] = await db
            .select({ id: channels.id, name: channels.name })
            .from(channels)
            .where(eq(channels.id, msg.channelId))
            .limit(1);
          channelInfo = ch || null;
        }
        return { ...msg, channel: channelInfo };
      })
    );

    enriched = enrichedRaw.map(msg => ({
      id: msg.id,
      type: 'message' as const,
      content: msg.content,
      channelId: msg.channelId ?? msg.channel?.id ?? null,
      channelName: msg.channel?.name ?? null,
      senderName: msg.user?.displayName ?? null,
      createdAt: msg.createdAt,
    }));
  }

  // Channel search (only when no in: operator forcing channel scope)
  const channelResults = textPattern && !parsed.in
    ? await db
        .select({ id: channels.id, name: channels.name })
        .from(channels)
        .where(
          channelIds.length > 0
            ? and(ilike(channels.name, textPattern), inArray(channels.id, channelIds))
            : ilike(channels.name, textPattern)
        )
        .limit(10)
    : [];

  // User search (only when no from: operator)
  const userResults = textPattern && !parsed.from
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(ilike(users.displayName, textPattern))
        .limit(10)
    : [];

  const allResults = [
    ...channelResults.map(ch => ({
      id: ch.id,
      type: 'channel' as const,
      content: ch.name,
      channelName: ch.name,
      senderName: null,
      channelId: ch.id,
    })),
    ...enriched,
    ...userResults.map(u => ({
      id: u.id,
      type: 'user' as const,
      content: u.displayName,
      senderName: u.displayName,
    })),
  ];

  return NextResponse.json({ results: allResults, textQuery: parsed.text });
}
