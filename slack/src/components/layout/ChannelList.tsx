'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Hash, Plus, ChevronDown, ChevronRight, ArrowUpDown, Clock, Archive, Folder, FolderOpen, FolderPlus, MoreHorizontal, X, Compass, Eye, EyeOff } from 'lucide-react';
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
  folderId?: string | null;
}

interface ChannelFolder {
  id: string;
  name: string;
  position: number;
  createdAt: string;
}

interface ChannelListProps {
  workspaceId?: string;
}

export default function ChannelList({ workspaceId }: ChannelListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { setCreateChannelOpen, setBrowseChannelsOpen } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [sortAlpha, setSortAlpha] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('channelUnreadFilter') === 'true';
  });
  const [archivedCollapsed, setArchivedCollapsed] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingChannelId, setMovingChannelId] = useState<string | null>(null);

  const url = workspaceId
    ? `/api/channels?workspaceId=${workspaceId}`
    : '/api/channels';

  const archivedUrl = workspaceId
    ? `/api/channels?workspaceId=${workspaceId}&archived=true`
    : '/api/channels?archived=true';

  const foldersUrl = workspaceId
    ? `/api/channel-folders?workspaceId=${workspaceId}`
    : null;

  const { data, mutate: mutateChannels } = useSWR<Channel[]>(url, fetcher, { refreshInterval: 5000 });
  const { data: archivedData } = useSWR<Channel[]>(archivedUrl, fetcher, { refreshInterval: 30000 });
  const { data: foldersData, mutate: mutateFolders } = useSWR<ChannelFolder[]>(
    foldersUrl,
    fetcher,
    { refreshInterval: 30000 }
  );

  const channels = Array.isArray(data) ? data : [];
  const archivedChannels = Array.isArray(archivedData) ? archivedData : [];
  const folders = Array.isArray(foldersData) ? foldersData : [];

  function toggleUnreadFilter() {
    setUnreadOnly((v) => {
      const next = !v;
      localStorage.setItem('channelUnreadFilter', String(next));
      return next;
    });
  }

  const sortedChannels = sortAlpha
    ? [...channels].sort((a, b) => a.name.localeCompare(b.name))
    : channels;

  const visibleChannels = unreadOnly
    ? sortedChannels.filter((c) => (c.unreadCount ?? 0) > 0)
    : sortedChannels;

  // Separate channels into foldered and unfoldered
  const unfiledChannels = visibleChannels.filter((c) => !c.folderId);
  const channelsByFolder = (folderId: string) =>
    visibleChannels.filter((c) => c.folderId === folderId);

  function isActive(channelName: string) {
    return pathname.startsWith(
      `/workspace/channel/${encodeURIComponent(channelName)}`
    );
  }

  function toggleFolder(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  async function handleCreateFolder() {
    if (!workspaceId || !newFolderName.trim()) return;
    await fetch('/api/channel-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim(), workspaceId }),
    });
    setNewFolderName('');
    setCreatingFolder(false);
    mutateFolders();
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm('Delete this folder? Channels inside will be moved to the main list.')) return;
    await fetch('/api/channel-folders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: folderId }),
    });
    mutateFolders();
    mutateChannels();
  }

  async function handleMoveChannel(channelId: string, targetFolderId: string | null) {
    const endpoint = targetFolderId
      ? `/api/channel-folders/${targetFolderId}/channels`
      : `/api/channel-folders/none/channels`;
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
    setMovingChannelId(null);
    mutateChannels();
  }

  function ChannelItem({ channel, indent = false }: { channel: Channel; indent?: boolean }) {
    const active = isActive(channel.name);
    const isMoving = movingChannelId === channel.id;

    return (
      <div className="relative group/channel">
        <button
          role="option"
          aria-selected={active}
          onClick={() => router.push(`/workspace/channel/${encodeURIComponent(channel.name)}`)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-[15px] transition-colors text-left',
            indent && 'pl-5',
            active
              ? 'bg-[#4a154b]/60 text-white'
              : 'text-[#bcabbc] hover:bg-white/5 hover:text-white'
          )}
        >
          <Hash className="w-4 h-4 shrink-0 opacity-70" />
          <span
            className={cn(
              'truncate flex-1',
              (channel.unreadCount ?? 0) > 0 && !active && 'font-semibold text-white'
            )}
          >
            {channel.name}
          </span>
          {(channel.unreadCount ?? 0) > 0 && !active && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shrink-0">
              {(channel.unreadCount ?? 0) > 99 ? '99+' : channel.unreadCount}
            </span>
          )}
        </button>
        {/* Move to folder button */}
        {workspaceId && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/channel:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMovingChannelId(isMoving ? null : channel.id);
              }}
              className="p-0.5 rounded text-[#bcabbc] hover:text-white hover:bg-white/10"
              title="Move to folder"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* Folder picker dropdown */}
        {isMoving && (
          <div className="absolute right-0 top-full mt-0.5 z-50 bg-[#222529] border border-white/10 rounded-lg shadow-xl py-1 min-w-36">
            <p className="px-3 py-1 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Move to</p>
            {channel.folderId && (
              <button
                onClick={() => handleMoveChannel(channel.id, null)}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
              >
                No folder
              </button>
            )}
            {folders.map((folder) =>
              folder.id !== channel.folderId ? (
                <button
                  key={folder.id}
                  onClick={() => handleMoveChannel(channel.id, folder.id)}
                  className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  {folder.name}
                </button>
              ) : null
            )}
            {folders.length === 0 && !channel.folderId && (
              <p className="px-3 py-1.5 text-xs text-slate-600">No folders yet</p>
            )}
          </div>
        )}
      </div>
    );
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
            onClick={toggleUnreadFilter}
            className={cn(
              'text-[#bcabbc] hover:text-white p-0.5 rounded transition-colors',
              unreadOnly && 'text-white'
            )}
            title={unreadOnly ? 'Show all channels' : 'Show unread only'}
          >
            {unreadOnly ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
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
          {workspaceId && (
            <button
              onClick={() => setCreatingFolder(true)}
              className="text-[#bcabbc] hover:text-white p-0.5 rounded"
              title="Create folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setCreateChannelOpen(true)}
            className="text-[#bcabbc] hover:text-white p-0.5 rounded"
            title="Add a channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Create folder inline form */}
      {creatingFolder && (
        <div className="px-2 py-1 flex items-center gap-1">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
            }}
            placeholder="Folder name"
            className="flex-1 bg-[#1a1d21] border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
          />
          <button
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim()}
            className="p-1 rounded text-[#bcabbc] hover:text-white hover:bg-white/10 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}
            className="p-1 rounded text-[#bcabbc] hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Channel Items */}
      {!collapsed && (
        <div
          className="mt-0.5 space-y-px"
          role="listbox"
          aria-label="Channels"
          onClick={() => { if (movingChannelId) setMovingChannelId(null); }}
        >
          {/* Folders */}
          {folders.map((folder) => {
            const folderChannels = channelsByFolder(folder.id);
            const isFolderCollapsed = collapsedFolders.has(folder.id);
            return (
              <div key={folder.id} className="space-y-px">
                <div className="flex items-center gap-1 px-2 py-1 group/folder">
                  <button
                    onClick={() => toggleFolder(folder.id)}
                    className="flex items-center gap-1.5 flex-1 text-[#bcabbc] hover:text-white text-xs font-semibold transition-colors"
                  >
                    {isFolderCollapsed ? (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    )}
                    {isFolderCollapsed ? (
                      <Folder className="w-3 h-3 shrink-0 opacity-70" />
                    ) : (
                      <FolderOpen className="w-3 h-3 shrink-0 opacity-70" />
                    )}
                    <span className="truncate">{folder.name}</span>
                    {folderChannels.length > 0 && (
                      <span className="text-[10px] text-slate-600 ml-0.5">({folderChannels.length})</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="opacity-0 group-hover/folder:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all"
                    title="Delete folder"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {!isFolderCollapsed && folderChannels.length > 0 && (
                  <div className="space-y-px">
                    {folderChannels.map((channel) => (
                      <ChannelItem key={channel.id} channel={channel} indent />
                    ))}
                  </div>
                )}
                {!isFolderCollapsed && folderChannels.length === 0 && (
                  <p className="pl-7 pr-2 py-1 text-xs text-slate-600 italic">Empty folder</p>
                )}
              </div>
            );
          })}

          {/* Unfiled channels */}
          {unfiledChannels.map((channel) => (
            <ChannelItem key={channel.id} channel={channel} />
          ))}

          {unreadOnly && channels.length > 0 && visibleChannels.length === 0 && (
            <p className="text-xs text-slate-500 px-4 py-1.5">No unread channels</p>
          )}

          {!unreadOnly && channels.length === 0 && (
            <button
              onClick={() => setCreateChannelOpen(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add channels</span>
            </button>
          )}

          {/* Browse channels button */}
          <button
            onClick={() => setBrowseChannelsOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors mt-1"
          >
            <Compass className="w-4 h-4 shrink-0 opacity-70" />
            <span>Browse channels</span>
          </button>
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
                  onClick={() => router.push(`/workspace/channel/${encodeURIComponent(channel.name)}`)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-[15px] transition-colors text-left opacity-60',
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
