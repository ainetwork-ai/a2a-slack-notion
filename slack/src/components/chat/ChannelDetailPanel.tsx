'use client';

import { useState } from 'react';
import { X, Hash, Pin, Archive, ArchiveRestore } from 'lucide-react';
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

type Tab = 'about' | 'members' | 'pinned' | 'files';

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

  const pinnedMessages = messages.filter(m => m.pinnedAt);
  const fileMessages = messages.filter(
    m => m.metadata && typeof m.metadata === 'object' && 'fileUrl' in m.metadata
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'about', label: 'About' },
    { id: 'members', label: 'Members', count: members.length },
    { id: 'pinned', label: 'Pinned', count: pinnedMessages.length },
    { id: 'files', label: 'Files', count: fileMessages.length },
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
                      <p className="text-sm text-white truncate">{member.displayName}</p>
                      {member.role && (
                        <Badge className="text-[10px] px-1 py-0 h-3.5 mt-0.5 bg-white/10 text-slate-400 border-white/10">
                          {member.role}
                        </Badge>
                      )}
                    </div>
                    {isAdmin && member.id !== currentUserId && (
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
      </div>
    </div>
  );
}
