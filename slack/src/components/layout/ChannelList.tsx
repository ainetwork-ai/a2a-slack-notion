'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Hash, Plus, ChevronDown, ChevronRight, ArrowUpDown, Clock, Archive } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Channel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  isArchived?: boolean;
  createdAt: string;
  unreadCount?: number;
  role?: string;
}

interface ChannelListProps {
  workspaceId?: string;
}

export default function ChannelList({ workspaceId }: ChannelListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { setCreateChannelOpen } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [sortAlpha, setSortAlpha] = useState(false);
  const [archivedCollapsed, setArchivedCollapsed] = useState(true);

  const url = workspaceId
    ? `/api/channels?workspaceId=${workspaceId}`
    : '/api/channels';

  const archivedUrl = workspaceId
    ? `/api/channels?workspaceId=${workspaceId}&archived=true`
    : '/api/channels?archived=true';

  const { data } = useSWR<Channel[]>(url, fetcher, { refreshInterval: 5000 });
  const { data: archivedData } = useSWR<Channel[]>(archivedUrl, fetcher, { refreshInterval: 30000 });
  const channels = Array.isArray(data) ? data : [];
  const archivedChannels = Array.isArray(archivedData) ? archivedData : [];

  const sortedChannels = sortAlpha
    ? [...channels].sort((a, b) => a.name.localeCompare(b.name))
    : channels;

  function isActive(channelId: string) {
    return pathname.startsWith(`/workspace/channel/${channelId}`);
  }

  return (
    <div className="px-2 py-1">
      {/* Section Header */}
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
          Channels
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setSortAlpha((v) => !v)}
            className={cn(
              'text-[#bcabbc] hover:text-white p-0.5 rounded transition-colors',
              sortAlpha && 'text-white'
            )}
            title={sortAlpha ? 'Sort by recent' : 'Sort alphabetically'}
          >
            {sortAlpha ? <Clock className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setCreateChannelOpen(true)}
            className="text-[#bcabbc] hover:text-white p-0.5 rounded"
            title="Add a channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Channel Items */}
      {!collapsed && (
        <div className="mt-0.5 space-y-px" role="listbox" aria-label="Channels">
          {sortedChannels.map((channel) => (
            <button
              key={channel.id}
              role="option"
              aria-selected={isActive(channel.id)}
              onClick={() => router.push(`/workspace/channel/${channel.id}`)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left',
                isActive(channel.id)
                  ? 'bg-[#4a154b]/60 text-white'
                  : 'text-[#bcabbc] hover:bg-white/5 hover:text-white'
              )}
            >
              <Hash className="w-4 h-4 shrink-0 opacity-70" />
              <span
                className={cn(
                  'truncate',
                  (channel.unreadCount ?? 0) > 0 && !isActive(channel.id) && 'font-semibold text-white'
                )}
              >
                {channel.name}
              </span>
              {(channel.unreadCount ?? 0) > 0 && !isActive(channel.id) && (
                <span className="ml-auto w-2 h-2 rounded-full bg-white shrink-0" />
              )}
            </button>
          ))}

          {channels.length === 0 && (
            <button
              onClick={() => setCreateChannelOpen(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add channels</span>
            </button>
          )}
        </div>
      )}

      {/* Archived Channels Section */}
      {archivedChannels.length > 0 && (
        <div className="mt-2 px-2">
          <button
            className="flex items-center gap-1 px-2 py-1 text-[#bcabbc] hover:text-white text-xs font-medium transition-colors w-full"
            onClick={() => setArchivedCollapsed(!archivedCollapsed)}
          >
            {archivedCollapsed ? (
              <ChevronRight className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 shrink-0" />
            )}
            <Archive className="w-3 h-3 shrink-0 opacity-60" />
            <span>Archived ({archivedChannels.length})</span>
          </button>

          {!archivedCollapsed && (
            <div className="mt-0.5 space-y-px">
              {archivedChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => router.push(`/workspace/channel/${channel.id}`)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left opacity-60',
                    isActive(channel.id)
                      ? 'bg-[#4a154b]/60 text-white opacity-100'
                      : 'text-[#bcabbc] hover:bg-white/5 hover:text-white hover:opacity-80'
                  )}
                >
                  <Hash className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
