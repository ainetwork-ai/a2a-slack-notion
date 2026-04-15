import * as polymarket from "./providers/polymarket";
import * as news from "./providers/news";

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
