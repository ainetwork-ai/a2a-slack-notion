'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, Puzzle, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface McpServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  tools: { name: string; description: string }[];
}

interface McpIntegration {
  id: string;
  channelId: string;
  serverId: string;
  enabled: boolean;
}

interface McpListProps {
  onServerClick?: (serverId: string) => void;
}

export default function McpList({ onServerClick }: McpListProps = {}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Extract current channelId from pathname
  const channelMatch = pathname.match(/\/workspace\/channel\/([^/]+)/);
  const channelId = channelMatch?.[1] ?? null;

  const { data: servers } = useSWR<McpServer[]>(
    '/api/mcp/servers',
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: integrations, mutate: mutateIntegrations } = useSWR<McpIntegration[]>(
    channelId ? `/api/channels/${channelId}/mcp` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const enabledIds = new Set(
    (Array.isArray(integrations) ? integrations : []).filter(i => i.enabled).map(i => i.serverId)
  );

  async function toggleMcp(serverId: string, currentlyEnabled: boolean) {
    if (!channelId) return;
    const existing = integrations?.find(i => i.serverId === serverId);
    if (existing) {
      await fetch(`/api/channels/${channelId}/mcp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, enabled: !currentlyEnabled }),
      });
    } else {
      await fetch(`/api/channels/${channelId}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });
    }
    mutateIntegrations();
  }

  if (!servers || servers.length === 0) return null;

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-2 py-1 group">
        <button
          className="flex items-center gap-1 text-[#bcabbc] hover:text-white text-sm font-semibold transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          MCP Integrations
        </button>
        <Puzzle className="w-3.5 h-3.5 text-[#bcabbc] opacity-50" />
      </div>

      {!collapsed && (
        <div className="mt-0.5 space-y-px">
          {!channelId && (
            <p className="px-2 py-1.5 text-[11px] text-slate-500">
              Open a channel to manage MCP integrations
            </p>
          )}

          {servers.map(server => {
            const isEnabled = enabledIds.has(server.id);
            return (
              <div
                key={server.id}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-[#bcabbc] hover:bg-white/5 group/item"
              >
                <span className="text-base shrink-0">{server.icon}</span>
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => onServerClick?.(server.id)}
                  title={`Open ${server.name} testbed`}
                >
                  <span className={cn('truncate block hover:underline', isEnabled ? 'text-white' : 'text-[#bcabbc]')}>
                    {server.name}
                  </span>
                  {isEnabled && channelId && (
                    <span className="text-[10px] text-green-400/70 block">/mcp {server.id}</span>
                  )}
                </button>
                {channelId && (
                  <button
                    onClick={() => toggleMcp(server.id, isEnabled)}
                    className="shrink-0 transition-colors"
                    title={isEnabled ? `Disable ${server.name}` : `Enable ${server.name}`}
                  >
                    {isEnabled ? (
                      <ToggleRight className="w-5 h-5 text-green-400" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-500 hover:text-slate-300" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
