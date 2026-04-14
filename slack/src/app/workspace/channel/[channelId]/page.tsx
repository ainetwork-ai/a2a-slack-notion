'use client';

import { useState, use, useEffect, useRef } from 'react';
import { Hash, Users, Settings, Pin, LogOut, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ThreadPanel from '@/components/chat/ThreadPanel';
import InviteMemberModal from '@/components/modals/InviteMemberModal';
import ChannelDetailPanel from '@/components/chat/ChannelDetailPanel';
import { useMessages, Message } from '@/lib/hooks/use-messages';
import { useTyping } from '@/lib/realtime/use-typing';
import { useAppStore } from '@/lib/stores/app-store';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ChannelMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role?: string;
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt?: string;
  lastReadAt?: string | null;
}

export default function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  const { activeThread, setActiveThread } = useAppStore();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { mutate } = useSWRConfig();

  // Capture lastReadAt before marking as read
  const lastReadAtRef = useRef<string | null>(null);

  async function saveDescription() {
    const trimmed = descriptionDraft.trim();
    setEditingDescription(false);
    await fetch(`/api/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: trimmed }),
    });
    mutate(`/api/channels/${channelId}`);
  }

  async function handleLeaveChannel() {
    await fetch(`/api/channels/${channelId}/members`, {
      method: 'DELETE',
    });
    router.push('/workspace');
  }

  // Issue 1: Reset active thread when switching channels
  useEffect(() => {
    setActiveThread(null);
  }, [channelId]);

  useEffect(() => {
    // First fetch channel to capture lastReadAt, then mark as read
    fetch(`/api/channels/${channelId}/members`)
      .then(r => r.json())
      .then(data => {
        if (data.lastReadAt) lastReadAtRef.current = data.lastReadAt;
      })
      .catch(() => {});

    fetch(`/api/channels/${channelId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead' }),
    });
  }, [channelId]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchQuery('');
      setSearchResults([]);
      return;
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery.trim())}&channelId=${channelId}`
        );
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, channelId]);

  const { data: channelData } = useSWR<Channel & { members?: ChannelMember[] }>(
    `/api/channels/${channelId}`,
    fetcher
  );

  const channel = channelData?.id
    ? { ...channelData, memberCount: channelData.members?.length }
    : undefined;

  const { messages, isLoading, hasMore, sendMessage, editMessage, deleteMessage, loadMore } =
    useMessages({ channelId });

  const pinnedMessages = messages.filter(m => m.pinnedAt);
  const { typingUsers } = useTyping(channelId);

  const activeMessage = activeThread
    ? messages.find(m => m.id === activeThread)
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Channel Header */}
      <div className="channel-header flex items-center justify-between px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="w-5 h-5 text-slate-400 shrink-0" />
          <span className="font-semibold text-white truncate">
            {channel?.name ?? '...'}
          </span>
          {editingDescription ? (
            <>
              <span className="text-slate-600 text-sm shrink-0">|</span>
              <input
                autoFocus
                value={descriptionDraft}
                onChange={e => setDescriptionDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveDescription();
                  if (e.key === 'Escape') setEditingDescription(false);
                }}
                onBlur={saveDescription}
                className="bg-transparent border-b border-white/30 text-slate-300 text-sm focus:outline-none focus:border-white/60 truncate min-w-0"
              />
            </>
          ) : channel?.description ? (
            <>
              <span className="text-slate-600 text-sm shrink-0">|</span>
              <span
                className="text-slate-400 text-sm truncate cursor-pointer hover:text-slate-200"
                onClick={() => { setDescriptionDraft(channel.description ?? ''); setEditingDescription(true); }}
                title="Click to edit description"
              >
                {channel.description}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* H4: Channel-scoped search */}
          {searchOpen ? (
            <div className="flex items-center gap-1 bg-white/10 rounded px-2 h-8">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }}
                placeholder="Search in channel…"
                className="bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none w-40"
              />
              <button onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="text-slate-400 hover:text-white hover:bg-white/10 h-8 w-8 p-0"
              title="Search in channel"
            >
              <Search className="w-4 h-4" />
            </Button>
          )}
          {/* H2: Pinned messages popover */}
          {pinnedMessages.length > 0 && (
            <Popover>
              <PopoverTrigger
                title={`${pinnedMessages.length} pinned ${pinnedMessages.length === 1 ? 'message' : 'messages'}`}
                className="inline-flex items-center gap-1.5 h-8 px-2 rounded text-[#e8912d] hover:text-[#e8912d] hover:bg-white/10 transition-colors text-xs"
              >
                <Pin className="w-4 h-4" />
                <span className="text-xs">{pinnedMessages.length}</span>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 bg-[#222529] border-white/10 text-white p-0">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-sm font-semibold">Pinned Messages</p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {pinnedMessages.map(msg => (
                    <div key={msg.id} className="flex items-start gap-2 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-300">{msg.senderName ?? 'Unknown'}</p>
                        <p className="text-sm text-slate-200 break-words line-clamp-3">{msg.content}</p>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/messages/${msg.id}/pin`, { method: 'POST' });
                        }}
                        className="shrink-0 text-slate-500 hover:text-white p-0.5 rounded transition-colors"
                        title="Unpin"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {channel?.memberCount !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetailPanelOpen(v => !v)}
              className="text-slate-400 hover:text-white hover:bg-white/10 gap-1.5 h-8"
            >
              <Users className="w-4 h-4" />
              <span className="text-xs">{channel.memberCount}</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center w-8 h-8 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none">
              <Settings className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#222529] border-white/10 text-white">
              <DropdownMenuItem
                onClick={handleLeaveChannel}
                className="text-red-400 hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave channel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* H4: Search results */}
      {searchOpen && searchQuery.trim() && (
        <div className="border-b border-white/5 bg-[#1a1d21] max-h-64 overflow-y-auto">
          {searchLoading ? (
            <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">No results found</div>
          ) : (
            searchResults.map(msg => (
              <div key={msg.id} className="px-4 py-2 hover:bg-white/5 border-b border-white/5 last:border-0">
                <p className="text-xs text-slate-500 mb-0.5">
                  {msg.senderName ?? 'Unknown'} · {new Date(msg.createdAt).toLocaleString()}
                </p>
                <p className="text-sm text-slate-200 break-words">{msg.content}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Item 11: Channel welcome banner when < 3 messages */}
          {!isLoading && messages.filter(m => m.contentType !== 'system').length < 3 && channel && (
            <div className="px-6 pt-6 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-3xl font-bold text-white">#{channel.name}</span>
              </div>
              <p className="text-slate-300 text-sm">
                Welcome to <span className="font-semibold text-white">#{channel.name}</span>! This is the beginning of the channel.
                {channel.description && (
                  <span className="text-slate-400"> — {channel.description}</span>
                )}
              </p>
            </div>
          )}
          <MessageList
            messages={messages}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onEdit={editMessage}
            onDelete={deleteMessage}
            lastReadAt={lastReadAtRef.current}
            channelId={channelId}
          />
          <TypingIndicator typingUsers={typingUsers} />
          <MessageInput
            onSend={sendMessage}
            placeholder={`Message #${channel?.name ?? ''}`}
            channelId={channelId}
          />
        </div>

        {/* Thread Panel */}
        {activeThread && (
          <ThreadPanel
            channelId={channelId}
            parentMessageId={activeThread}
            parentMessageContent={activeMessage?.content}
          />
        )}

        {/* Channel Detail Panel */}
        {detailPanelOpen && (
          <ChannelDetailPanel
            channelId={channelId}
            channelName={channel?.name ?? ''}
            channelDescription={channel?.description}
            createdAt={channel?.createdAt}
            members={channelData?.members ?? []}
            messages={messages}
            onClose={() => setDetailPanelOpen(false)}
          />
        )}
      </div>

      {/* Invite Modal */}
      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        channelId={channelId}
        channelName={channel?.name}
      />
    </div>
  );
}
