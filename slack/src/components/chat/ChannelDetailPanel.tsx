'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Hash, Pin, Archive, ArchiveRestore, Puzzle, Check, Plus, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Message } from '@/lib/hooks/use-messages';

interface ChannelMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role?: string;
  isAgent?: boolean;
  engagementLevel?: number;
}

interface ChannelDetailPanelProps {
  channelId: string;
  channelName: string;
  channelDescription?: string;
  createdAt?: string;
  members?: ChannelMember[];
  messages?: Message[];
  currentUserId?: string;
  isAdmin?: boolean;
  isArchived?: boolean;
  onClose: () => void;
  onRemoveMember?: (userId: string) => void;
  onArchiveToggle?: (archived: boolean) => void;
}

interface McpIntegration {
  id: string;
  channelId: string;
  serverId: string;
  enabled: boolean;
  config: unknown;
  addedBy: string;
  createdAt: string;
}

interface McpServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  tools: { name: string; description: string }[];
}

type Tab = 'about' | 'members' | 'pinned' | 'files' | 'integrations';

export default function ChannelDetailPanel({
  channelId,
  channelName,
  channelDescription,
  createdAt,
  members = [],
  messages = [],
  currentUserId,
  isAdmin,
  isArchived = false,
  onClose,
  onRemoveMember,
  onArchiveToggle,
}: ChannelDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('about');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpIntegrations, setMcpIntegrations] = useState<McpIntegration[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [engagementLevels, setEngagementLevels] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const m of members) {
      if (m.isAgent) initial[m.id] = m.engagementLevel ?? 0;
    }
    return initial;
  });

  const fetchMcpData = useCallback(async () => {
    setMcpLoading(true);
    try {
      const [serversRes, integrationsRes] = await Promise.all([
        fetch('/api/mcp/servers'),
        fetch(`/api/channels/${channelId}/mcp`),
      ]);
      if (serversRes.ok) setMcpServers(await serversRes.json());
      if (integrationsRes.ok) setMcpIntegrations(await integrationsRes.json());
    } catch {
      // ignore
    } finally {
      setMcpLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (activeTab === 'integrations') {
      fetchMcpData();
    }
  }, [activeTab, fetchMcpData]);

  async function toggleMcp(serverId: string, currentlyEnabled: boolean) {
    const existing = mcpIntegrations.find(i => i.serverId === serverId);
    if (existing) {
      const res = await fetch(`/api/channels/${channelId}/mcp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, enabled: !currentlyEnabled }),
      });
      if (res.ok) fetchMcpData();
    } else {
      const res = await fetch(`/api/channels/${channelId}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });
      if (res.ok) fetchMcpData();
    }
  }

  async function updateEngagementLevel(targetUserId: string, level: number) {
    setEngagementLevels(prev => ({ ...prev, [targetUserId]: level }));
    await fetch(`/api/channels/${channelId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setEngagementLevel', targetUserId, engagementLevel: level }),
    });
  }

  const ENGAGEMENT_LABELS: Record<number, { label: string; icon: string }> = {
    0: { label: 'Silent', icon: '—' },
    1: { label: 'Reactive', icon: '👁' },
    2: { label: 'Engaged', icon: '💬' },
    3: { label: 'Proactive', icon: '⚡' },
  };

  const pinnedMessages = messages.filter(m => m.pinnedAt);
  const fileMessages = messages.filter(
    m => m.metadata && typeof m.metadata === 'object' && 'fileUrl' in m.metadata
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'about', label: 'About' },
    { id: 'members', label: 'Members', count: members.length },
    { id: 'pinned', label: 'Pinned', count: pinnedMessages.length },
    { id: 'files', label: 'Files', count: fileMessages.length },
    { id: 'integrations', label: 'MCP' },
  ];

  return (
    <div className="flex flex-col w-72 border-l border-white/5 bg-[#1a1d21] shrink-0 h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-1.5">
          <Hash className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-white text-sm truncate">{channelName}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors relative',
              activeTab === tab.id
                ? 'text-white'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-[10px] text-slate-500">{tab.count}</span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4a154b]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'about' && (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm text-slate-300">
                {channelDescription || <span className="text-slate-500 italic">No description set</span>}
              </p>
            </div>
            {createdAt && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Created</p>
                <p className="text-sm text-slate-300">{format(new Date(createdAt), 'MMMM d, yyyy')}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Channel ID</p>
              <p className="text-xs text-slate-500 font-mono break-all">{channelId}</p>
            </div>
            {isAdmin && onArchiveToggle && (
              <div className="pt-2 border-t border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onArchiveToggle(!isArchived)}
                  className={cn(
                    'w-full justify-start gap-2 text-sm',
                    isArchived
                      ? 'text-green-400 hover:text-green-300 hover:bg-green-500/10'
                      : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                  )}
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="w-4 h-4" />
                      Unarchive channel
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" />
                      Archive channel
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="py-2">
            {members.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-8">No members</p>
            ) : (
              members.map(member => {
                const initials = member.displayName
                  .split(' ')
                  .map(w => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors"
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
                      <AvatarFallback className="text-xs bg-[#4a154b] text-white">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm text-white truncate">{member.displayName}</p>
                        {member.isAgent && <Bot className="w-3 h-3 text-[#36c5f0] shrink-0" />}
                      </div>
                      {member.role && (
                        <Badge className="text-[10px] px-1 py-0 h-3.5 mt-0.5 bg-white/10 text-slate-400 border-white/10">
                          {member.role}
                        </Badge>
                      )}
                    </div>
                    {member.isAgent && isAdmin && (
                      <select
                        value={engagementLevels[member.id] ?? 0}
                        onChange={e => updateEngagementLevel(member.id, Number(e.target.value))}
                        className="text-xs bg-white/5 border border-white/10 rounded px-1 py-0.5 text-slate-300 shrink-0 cursor-pointer hover:bg-white/10 transition-colors"
                        title="Agent engagement level"
                      >
                        {Object.entries(ENGAGEMENT_LABELS).map(([val, { label, icon }]) => (
                          <option key={val} value={val}>
                            {icon} {label}
                          </option>
                        ))}
                      </select>
                    )}
                    {!member.isAgent && isAdmin && member.id !== currentUserId && (
                      <button
                        onClick={() => onRemoveMember?.(member.id)}
                        className="text-xs text-red-400 hover:text-red-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'pinned' && (
          <div className="py-2">
            {pinnedMessages.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-8">No pinned messages</p>
            ) : (
              pinnedMessages.map(msg => (
                <div
                  key={msg.id}
                  className="px-4 py-3 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Pin className="w-3 h-3 text-[#e8912d]" />
                    <span className="text-xs font-medium text-white">{msg.senderName}</span>
                    <span className="text-[10px] text-slate-500">
                      {format(new Date(msg.createdAt), 'MMM d')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-3">{msg.content}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="py-2">
            {fileMessages.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-8">No files shared</p>
            ) : (
              fileMessages.map(msg => {
                const meta = msg.metadata as { fileUrl: string; fileName?: string; mimeType?: string };
                const isImage = meta.mimeType?.startsWith('image/');
                return (
                  <div
                    key={msg.id}
                    className="px-4 py-3 border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-xs font-medium text-white">{msg.senderName}</span>
                      <span className="text-[10px] text-slate-500">
                        {format(new Date(msg.createdAt), 'MMM d')}
                      </span>
                    </div>
                    {isImage ? (
                      <a href={meta.fileUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={meta.fileUrl}
                          alt={meta.fileName ?? 'image'}
                          className="max-h-24 rounded border border-white/10 object-contain"
                        />
                      </a>
                    ) : (
                      <a
                        href={meta.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-2 hover:bg-white/10 transition-colors"
                      >
                        <span className="text-xs text-[#36c5f0] truncate">{meta.fileName ?? 'File'}</span>
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="py-2">
            {mcpLoading ? (
              <p className="text-center text-slate-500 text-sm py-8">Loading...</p>
            ) : mcpServers.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-8">No MCP servers available</p>
            ) : (
              <div className="space-y-1">
                <div className="px-4 py-2">
                  <p className="text-xs text-slate-500 mb-3">
                    Enable MCP integrations to use <code className="bg-white/5 px-1 rounded">/polymarket</code> and <code className="bg-white/5 px-1 rounded">/news</code> commands in this channel.
                  </p>
                </div>
                {mcpServers.map(server => {
                  const integration = mcpIntegrations.find(i => i.serverId === server.id);
                  const isEnabled = integration?.enabled ?? false;
                  return (
                    <div
                      key={server.id}
                      className="mx-3 rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-3 py-3">
                        <span className="text-lg shrink-0">{server.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{server.name}</p>
                          <p className="text-xs text-slate-400 truncate">{server.description}</p>
                        </div>
                        {isAdmin ? (
                          <button
                            onClick={() => toggleMcp(server.id, isEnabled)}
                            className={cn(
                              'shrink-0 w-8 h-5 rounded-full transition-colors relative',
                              isEnabled ? 'bg-[#007a5a]' : 'bg-white/10'
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                isEnabled ? 'left-3.5' : 'left-0.5'
                              )}
                            />
                          </button>
                        ) : (
                          <Badge className={cn(
                            'text-[10px] px-1.5 py-0 h-4 border',
                            isEnabled
                              ? 'bg-[#007a5a]/20 text-green-400 border-green-500/20'
                              : 'bg-white/5 text-slate-500 border-white/10'
                          )}>
                            {isEnabled ? 'Active' : 'Off'}
                          </Badge>
                        )}
                      </div>
                      {isEnabled && (
                        <div className="px-3 pb-3 pt-0">
                          <div className="border-t border-white/5 pt-2 space-y-1">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Commands</p>
                            {server.tools.map(tool => (
                              <div key={tool.name} className="flex items-start gap-1.5">
                                <code className="text-[11px] text-[#36c5f0] shrink-0">/mcp {server.id} {tool.name}</code>
                                <span className="text-[11px] text-slate-500">— {tool.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
