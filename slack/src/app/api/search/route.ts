import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, dmMembers, canvases, blocks, workspaceMembers } from "@/lib/db/schema";
import { eq, and, desc, isNotNull, lt, gt, inArray, or, ilike, sql, SQL } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { meili } from "@/lib/search/meili-client";
import { INDEX_PAGES, INDEX_BLOCKS } from "@/lib/search/indexes";
import { extractTitle, type MeiliPage, type MeiliBlock } from "@/lib/search/indexer";

// Scope token from ?scope= — selects which buckets participate in the response.
type SearchScope = 'all' | 'channels' | 'messages' | 'docs';

/**
 * Search Notion pages + blocks. Tries Meilisearch first, falls back to
 * Postgres ILIKE. Results are grouped so each page appears once with block
 * snippets collapsed under it.
 *
 * Never throws — returns `{ pages: [], blocks: [] }` on any failure
 * (e.g. MEILI_HOST unset, network error, index missing).
 */
async function searchDocs(
  q: string,
  workspaceId: string,
  limit: number,
): Promise<{
  pages: Array<{ id: string; title: string; icon?: string | null; workspaceId: string }>;
  blocks: Array<{ id: string; pageId: string; text: string; type: string; workspaceId: string }>;
}> {
  if (!q || !workspaceId) return { pages: [], blocks: [] };

  // Meilisearch path
  if (process.env.MEILI_HOST) {
    try {
      const filter = `workspaceId = "${workspaceId}"`;
      const [pageRes, blockRes] = await Promise.all([
        meili.index(INDEX_PAGES.uid).search<MeiliPage>(q, {
          filter,
          limit,
          attributesToHighlight: ['title', 'topic'],
        }),
        meili.index(INDEX_BLOCKS.uid).search<MeiliBlock>(q, {
          filter,
          limit,
          attributesToHighlight: ['text'],
          attributesToCrop: ['text'],
          cropLength: 20,
        }),
      ]);
      return {
        pages: (pageRes.hits as MeiliPage[]).map((h: MeiliPage) => ({
          id: h.id,
          title: h.title,
          icon: h.icon ?? null,
          workspaceId: h.workspaceId,
        })),
        blocks: (blockRes.hits as MeiliBlock[]).map((h: MeiliBlock) => ({
          id: h.id,
          pageId: h.pageId,
          text: h.text,
          type: h.type,
          workspaceId: h.workspaceId,
        })),
      };
    } catch {
      // Fall through to Postgres fallback — Meili may be unreachable / index missing
    }
  }

  // Postgres ILIKE fallback (handles both Meili-down and MEILI_HOST unset).
  try {
    const likeQ = `%${q}%`;
    const pageRows = await db
      .select()
      .from(blocks)
      .where(and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
        ilike(sql`${blocks.properties}->>'title'`, likeQ),
      ))
      .limit(limit);

    const blockRows = await db
      .select()
      .from(blocks)
      .where(and(
        eq(blocks.workspaceId, workspaceId),
        sql`${blocks.type} <> 'page'`,
        eq(blocks.archived, false),
        or(
          ilike(sql`${blocks.properties}->>'title'`, likeQ),
          ilike(sql`${blocks.content}::text`, likeQ),
        ) as ReturnType<typeof eq>,
      ))
      .limit(limit);

    return {
      pages: pageRows.map((p) => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        const icon = typeof props.icon === 'string' ? (props.icon as string) : null;
        return {
          id: p.id,
          title: extractTitle(props) || 'Untitled',
          icon,
          workspaceId: p.workspaceId,
        };
      }),
      blocks: blockRows.map((b) => {
        const props = (b.properties ?? {}) as Record<string, unknown>;
        const title = extractTitle(props);
        const contentText = typeof (b.content as Record<string, unknown>)?.text === 'string'
          ? String((b.content as Record<string, unknown>).text)
          : '';
        return {
          id: b.id,
          pageId: b.pageId,
          text: (title || contentText || '').slice(0, 200),
          type: b.type,
          workspaceId: b.workspaceId,
        };
      }),
    };
  } catch {
    return { pages: [], blocks: [] };
  }
}

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
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const scopeParam = (searchParams.get('scope') ?? 'all').toLowerCase() as SearchScope;
  const scope: SearchScope = (['all', 'channels', 'messages', 'docs'] as const).includes(
    scopeParam as SearchScope,
  )
    ? scopeParam
    : 'all';
  const workspaceParam = searchParams.get('workspace') ?? searchParams.get('workspaceId');

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
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const pageResults = hasMore ? results.slice(0, limit) : results;

    const enriched = pageResults.map(msg => ({
      ...msg,
      senderName: msg.user?.displayName ?? null,
      channel: { id: channelIdFilter, name: '' },
      conversation: null,
    }));
    return NextResponse.json({ results: enriched, textQuery: parsed.text, hasMore, offset, limit });
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
      return NextResponse.json({ results: allResults, textQuery: parsed.text, hasMore: false, offset: 0, limit });
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

  let hasMore = false;

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
      .limit(limit + 1)
      .offset(offset);

    const hasMoreMessages = msgResults.length > limit;
    const pageMsgResults = hasMoreMessages ? msgResults.slice(0, limit) : msgResults;

    // Enrich with channel/conversation info
    const enrichedRaw = await Promise.all(
      pageMsgResults.map(async (msg) => {
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

    hasMore = hasMoreMessages;
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

  // Canvas search
  const canvasResults = textPattern && !parsed.in && !parsed.from
    ? await db
        .select({ id: canvases.id, title: canvases.title, content: canvases.content, channelId: canvases.channelId })
        .from(canvases)
        .where(
          and(
            or(ilike(canvases.title, textPattern), ilike(canvases.content, textPattern))!,
            channelIds.length > 0 ? inArray(canvases.channelId, channelIds) : undefined
          )
        )
        .limit(10)
    : [];

  // Notion pages/blocks — Meili-backed, gracefully degrades to Postgres.
  // Requires a workspace scope; if absent, we skip docs to avoid cross-workspace leakage.
  let docsPages: Array<{ id: string; type: 'page'; title: string; content: string; workspaceId: string; icon?: string | null }> = [];
  let docsBlocks: Array<{ id: string; type: 'block'; pageId: string; content: string; blockType: string; workspaceId: string }> = [];

  if (parsed.text && workspaceParam && (scope === 'all' || scope === 'docs')) {
    // Verify workspace membership before running doc search to avoid leakage
    const [wm] = await db
      .select()
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceParam),
        eq(workspaceMembers.userId, user.id),
      ))
      .limit(1);

    if (wm) {
      const docs = await searchDocs(parsed.text, workspaceParam, Math.min(limit, 20));
      docsPages = docs.pages.map((p) => ({
        id: p.id,
        type: 'page' as const,
        title: p.title,
        content: p.title,
        icon: p.icon ?? null,
        workspaceId: p.workspaceId,
      }));
      // Collapse blocks by pageId so each page surfaces at most one block snippet
      const seen = new Set<string>();
      for (const b of docs.blocks) {
        if (seen.has(b.pageId)) continue;
        seen.add(b.pageId);
        docsBlocks.push({
          id: b.id,
          type: 'block' as const,
          pageId: b.pageId,
          content: b.text,
          blockType: b.type,
          workspaceId: b.workspaceId,
        });
      }
    }
  }

  // Apply scope filter to the Slack-side buckets.
  const showChannels = scope === 'all' || scope === 'channels';
  const showMessages = scope === 'all' || scope === 'messages';
  const showUsers = scope === 'all';
  const showCanvases = scope === 'all' || scope === 'docs';
  const showDocs = scope === 'all' || scope === 'docs';

  const allResults = [
    ...(showChannels ? channelResults.map(ch => ({
      id: ch.id,
      type: 'channel' as const,
      content: ch.name,
      channelName: ch.name,
      senderName: null,
      channelId: ch.id,
    })) : []),
    ...(showCanvases ? canvasResults.map(c => ({
      id: c.id,
      type: 'canvas' as const,
      content: c.title,
      channelId: c.channelId ?? null,
      channelName: null,
      senderName: null,
    })) : []),
    ...(showDocs ? docsPages : []),
    ...(showDocs ? docsBlocks : []),
    ...(showMessages ? enriched : []),
    ...(showUsers ? userResults.map(u => ({
      id: u.id,
      type: 'user' as const,
      content: u.displayName,
      senderName: u.displayName,
    })) : []),
  ];

  return NextResponse.json({ results: allResults, textQuery: parsed.text, hasMore, offset, limit, scope });
}
