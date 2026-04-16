import * as polymarket from "./providers/polymarket";
import * as news from "./providers/news";
import * as slack from "./providers/slack";
import * as document from "./providers/document";

type ProviderFn = (params: Record<string, unknown>) => Promise<string>;

const providers: Record<string, Record<string, ProviderFn>> = {
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
