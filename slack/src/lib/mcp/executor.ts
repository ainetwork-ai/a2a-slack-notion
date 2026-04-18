import * as polymarket from "./providers/polymarket";
import * as news from "./providers/news";
import * as slack from "./providers/slack";
import * as document from "./providers/document";
import * as newsroom from "./providers/newsroom";
import { db } from "@/lib/db";
import {
  channelMcpIntegrations,
  channels,
  workspaceMcpIntegrations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type ProviderFn = (params: Record<string, unknown>) => Promise<string>;

const providers: Record<string, Record<string, ProviderFn>> = {
  newsroom: {
    slack_thread_read: newsroom.slack_thread_read as ProviderFn,
    notion_story_get: newsroom.notion_story_get as ProviderFn,
  },
  polymarket: {
    trending: polymarket.trending as ProviderFn,
    search: polymarket.search as ProviderFn,
    market: polymarket.market as ProviderFn,
  },
  news: {
    search: news.search as ProviderFn,
    trending: news.trending as ProviderFn,
    topic: news.topic as ProviderFn,
  },
  slack: {
    read_thread: slack.read_thread as ProviderFn,
    get_context: slack.get_context as ProviderFn,
    search: slack.search as ProviderFn,
    channel_info: slack.channel_info as ProviderFn,
    memory_read: slack.memory_read as ProviderFn,
    memory_write: slack.memory_write as ProviderFn,
    memory_delete: slack.memory_delete as ProviderFn,
    agent_create: slack.agent_create as ProviderFn,
    agent_list: slack.agent_list as ProviderFn,
    canvas_read: slack.canvas_read as ProviderFn,
    canvas_write: slack.canvas_write as ProviderFn,
    canvas_append: slack.canvas_append as ProviderFn,
    canvas_update_section: slack.canvas_update_section as ProviderFn,
    canvas_read_section: slack.canvas_read_section as ProviderFn,
    canvas_set_status: slack.canvas_set_status as ProviderFn,
  },
  document: {
    convert: document.convert as ProviderFn,
    metadata: document.metadata as ProviderFn,
    search: document.search as ProviderFn,
  },
};

export interface ExecuteResult {
  success: boolean;
  content: string;
}

export async function executeTool(
  serverId: string,
  toolName: string,
  params: Record<string, unknown> = {}
): Promise<ExecuteResult> {
  const server = providers[serverId];
  if (!server) {
    return { success: false, content: `Unknown MCP server: ${serverId}` };
  }

  const tool = server[toolName];
  if (!tool) {
    const available = Object.keys(server).join(", ");
    return { success: false, content: `Unknown tool "${toolName}" for ${serverId}. Available: ${available}` };
  }

  try {
    const content = await tool(params);
    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      content: `Error executing ${serverId}.${toolName}: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Resolve which MCP integrations are active for a given scope.
 *
 * Scope rules:
 *   - If `channelId` is provided: union (workspace-level rows for that
 *     channel's workspace) ∪ (channel-level rows). A channel-level row with
 *     `enabled=false` overrides workspace-level for that `serverId`. A
 *     channel-level row with `enabled=true` (or absent) lets workspace-level
 *     pass through.
 *   - If only `workspaceId` is provided (e.g. Notion page context): use
 *     workspace-level rows only.
 *   - At least one of `channelId` / `workspaceId` must be provided.
 *
 * Returns the set of `serverId`s that are currently enabled for the scope.
 */
export async function resolveEnabledServers(opts: {
  channelId?: string;
  workspaceId?: string;
}): Promise<string[]> {
  const { channelId } = opts;
  let workspaceId = opts.workspaceId ?? null;

  if (!channelId && !workspaceId) {
    return [];
  }

  if (!workspaceId && channelId) {
    const [ch] = await db
      .select({ workspaceId: channels.workspaceId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    workspaceId = ch?.workspaceId ?? null;
  }

  // Workspace-level rows
  const wsRows = workspaceId
    ? await db
        .select({
          serverId: workspaceMcpIntegrations.serverId,
          enabled: workspaceMcpIntegrations.enabled,
        })
        .from(workspaceMcpIntegrations)
        .where(eq(workspaceMcpIntegrations.workspaceId, workspaceId))
    : [];

  // Channel-level rows (only if a channel is in scope)
  const chRows = channelId
    ? await db
        .select({
          serverId: channelMcpIntegrations.serverId,
          enabled: channelMcpIntegrations.enabled,
        })
        .from(channelMcpIntegrations)
        .where(eq(channelMcpIntegrations.channelId, channelId))
    : [];

  const channelMap = new Map<string, boolean>();
  for (const r of chRows) channelMap.set(r.serverId, r.enabled);

  const result = new Set<string>();

  // Workspace rows pass through unless channel explicitly disables them.
  for (const r of wsRows) {
    if (!r.enabled) continue;
    const override = channelMap.get(r.serverId);
    if (override === false) continue; // channel disabled overrides workspace
    result.add(r.serverId);
  }
  // Channel rows enabled=true add (or keep) the server.
  for (const [serverId, enabled] of channelMap) {
    if (enabled) result.add(serverId);
  }

  return [...result];
}

/**
 * Scoped execution helper for server-side callers (e.g. Notion automation
 * engine, Slack message handlers).
 *
 * Verifies the requested `serverId` is enabled for the supplied scope, then
 * dispatches to {@link executeTool}. Caller picks scope by passing either
 * `channelId` (channel context) or `workspaceId` (e.g. Notion page context).
 */
export async function executeToolScoped(opts: {
  serverId: string;
  toolName: string;
  params?: Record<string, unknown>;
  channelId?: string;
  workspaceId?: string;
}): Promise<ExecuteResult> {
  const { serverId, toolName, params, channelId, workspaceId } = opts;
  if (!channelId && !workspaceId) {
    return {
      success: false,
      content: "executeToolScoped requires channelId or workspaceId",
    };
  }
  const enabled = await resolveEnabledServers({ channelId, workspaceId });
  if (!enabled.includes(serverId)) {
    return {
      success: false,
      content: `${serverId} is not enabled for this scope.`,
    };
  }
  return executeTool(serverId, toolName, params || {});
}
