'use client';

import { useState, use, useEffect, useRef, useCallback } from 'react';
import { Hash, Settings, Pin, LogOut, Search, X, Bell, BellOff, BellRing, FileText } from 'lucide-react';
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
import CanvasEditor from '@/components/canvas/CanvasEditor';
import BookmarksBar from '@/components/channel/BookmarksBar';
import MemberAvatarStack from '@/components/channel/MemberAvatarStack';
import { pushRecentVisit } from '@/lib/hooks/use-recent-visits';
import { useMessages, Message } from '@/lib/hooks/use-messages';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTyping } from '@/lib/realtime/use-typing';
import { useAppStore } from '@/lib/stores/app-store';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ChannelMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role?: string;
  isAgent?: boolean;
  engagementLevel?: number;
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt?: string;
  lastReadAt?: string | null;
  isArchived?: boolean;
}

export default function ChannelPage({ params }: { params: Promise<{ channelName: string }> }) {
  const { channelName: urlParam } = use(params);
  const channelName = decodeURIComponent(urlParam);
  const { user: authUser } = useAuth();
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
  const [notifPref, setNotifPref] = useState<'all' | 'mentions' | 'none'>('all');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
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
    const confirmed = window.confirm(
      `Leave #${channel?.name ?? 'this channel'}? You can rejoin if it's public.`
    );
    if (!confirmed) return;
    await fetch(`/api/channels/${channelId}/members`, {
      method: 'DELETE',
    });
    router.push('/workspace');
  }

  async function handleArchiveToggle(archived: boolean) {
    await fetch(`/api/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: archived }),
    });
    mutate(`/api/channels/${channelId}`);
    // Revalidate channel list so sidebar updates
    mutate((key: string) => typeof key === 'string' && key.startsWith('/api/channels'), undefined, { revalidate: true });
    if (archived) router.push('/workspace');
  }

  // Resolve the channel name from the URL to the canonical channel row.
  // The backend endpoint accepts either a UUID or a workspace-scoped channel name.
  const { data: channelData } = useSWR<Channel & { members?: ChannelMember[] }>(
    `/api/channels/${encodeURIComponent(channelName)}`,
    fetcher
  );
  const channelId = channelData?.id ?? '';

  interface CanvasSummary { id: string; title: string; topic?: string | null; updatedAt: string }
  const { data: canvasListData } = useSWR<{ canvases: CanvasSummary[]; nextCursor?: string }>(
    channelId ? `/api/channels/${channelId}/canvases` : null,
    fetcher
  );
  // Use the first (newest) canvas for the pinned preview
  const canvasData = canvasListData?.canvases?.[0] ?? null;

  const channel = channelData?.id
    ? { ...channelData, memberCount: channelData.members?.length }
    : undefined;

  // Auto-open canvas if ?canvas=1 in URL
  useEffect(() => {
    if (searchParams.get('canvas') === '1') {
      setCanvasOpen(true);
    }
  }, [searchParams]);

  // Open canvas panel when a "View on Canvas" button is clicked in chat
  useEffect(() => {
    function handleOpenCanvas() {
      setCanvasOpen(true);
    }
    window.addEventListener('open-canvas', handleOpenCanvas);
    return () => window.removeEventListener('open-canvas', handleOpenCanvas);
  }, []);

  // Issue 1: Reset active thread when switching channels
  useEffect(() => {
    setActiveThread(null);
  }, [channelId, setActiveThread]);

  // Track recent visits for Cmd+K switcher
  useEffect(() => {
    if (channel?.name) {
      pushRecentVisit({
        type: 'channel',
        id: channel.name,
        label: channel.name,
        isPrivate: (channel as Channel & { isPrivate?: boolean }).isPrivate,
      });
    }
  }, [channel?.name, channel]);

  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/channels/${channelId}/read`, { method: 'PATCH' })
      .then(r => r.json())
      .then((data: { previousLastReadAt?: string | null }) => {
        if (data.previousLastReadAt) {
          lastReadAtRef.current = typeof data.previousLastReadAt === 'string'
            ? data.previousLastReadAt
            : (data.previousLastReadAt as Date).toISOString();
        }
      })
      .catch(() => {});
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/channels/${channelId}/notifications`)
      .then(r => r.json())
      .then((data: { pref?: string }) => {
        if (data.pref) setNotifPref(data.pref as 'all' | 'mentions' | 'none');
      })
      .catch(() => {});
  }, [channelId]);

  async function updateNotifPref(pref: 'all' | 'mentions' | 'none') {
    if (!channelId) return;
    setNotifPref(pref);
    await fetch(`/api/channels/${channelId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pref }),
    });
  }

  useEffect(() => {
    if (!searchOpen) {
      setSearchQuery('');
      setSearchResults([]);
      return;
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchQuery.trim() || !channelId) {
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

  const { messages, isLoading, hasMore, sendMessage, editMessage, deleteMessage, loadMore } =
    useMessages({ channelId, currentUser: authUser ? { id: authUser.id, displayName: authUser.displayName, avatarUrl: authUser.avatarUrl } : undefined });

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
          <span className="font-black text-[18px] text-white truncate">
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
                title={channel.description}
              >
                {channel.description}
              </span>
            </>
          ) : channel ? (
            <span
              className="text-slate-600 text-sm truncate cursor-pointer hover:text-slate-400 italic"
              onClick={() => { setDescriptionDraft(''); setEditingDescription(true); }}
              title="Add a description"
            >
              Add a description
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Canvas button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCanvasOpen(v => !v)}
            className={`gap-1.5 h-8 text-xs ${canvasOpen ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
            title="Canvas"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Canvas</span>
          </Button>
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
            <MemberAvatarStack
              members={channelData?.members ?? []}
              onClick={() => setDetailPanelOpen(v => !v)}
            />
          )}
          {(() => {
            const activeAgents = (channelData?.members ?? []).filter(
              m => m.isAgent && (m.engagementLevel ?? 0) >= 2
            );
            if (activeAgents.length === 0) return null;
            return (
              <button
                onClick={() => setDetailPanelOpen(v => !v)}
                className="text-xs text-slate-400 hover:text-slate-200 hover:bg-white/10 px-2 h-8 rounded transition-colors"
                title="Agents in Engaged or Proactive mode"
              >
                🤖 {activeAgents.length} {activeAgents.length === 1 ? 'agent' : 'agents'} active
              </button>
            );
          })()}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center w-8 h-8 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none">
              <Settings className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#222529] border-white/10 text-white">
              <DropdownMenuItem
                onClick={() => updateNotifPref('all')}
                className={`cursor-pointer ${notifPref === 'all' ? 'text-white bg-white/10' : 'text-slate-400'}`}
              >
                <BellRing className="w-4 h-4 mr-2" />
                All messages
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => updateNotifPref('mentions')}
                className={`cursor-pointer ${notifPref === 'mentions' ? 'text-white bg-white/10' : 'text-slate-400'}`}
              >
                <Bell className="w-4 h-4 mr-2" />
                Mentions only
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => updateNotifPref('none')}
                className={`cursor-pointer ${notifPref === 'none' ? 'text-white bg-white/10' : 'text-slate-400'}`}
              >
                <BellOff className="w-4 h-4 mr-2" />
                Muted
              </DropdownMenuItem>
              <div className="my-1 border-t border-white/10" />
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

      {/* Bookmarks bar */}
      {channelId && <BookmarksBar channelId={channelId} />}

      {/* H4: Search results */}
      {searchOpen && searchQuery.trim() && (
        <div className="border-b border-white/5 bg-[#1a1d21] max-h-64 overflow-y-auto">
          {searchLoading ? (
            <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-4 flex flex-col gap-1">
              <p className="text-sm font-medium text-slate-300">No results found for &ldquo;{searchQuery}&rdquo;</p>
              <p className="text-xs text-slate-500">Try a different search term.</p>
            </div>
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
          {/* Canvas pinned preview */}
          {canvasData?.id && !canvasOpen && (
            <div className="mx-4 mt-3 mb-1 flex items-start gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 shrink-0">
              <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-300 truncate">{canvasData.title}</p>
                {canvasData.topic && (
                  <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                    {canvasData.topic.slice(0, 200)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setCanvasOpen(true)}
                className="shrink-0 text-xs text-[#1d9bd1] hover:underline whitespace-nowrap"
              >
                Open canvas
              </button>
            </div>
          )}

          {/* Channel welcome banner when < 3 messages */}
          {!isLoading && messages.filter(m => m.contentType !== 'system').length < 3 && channel && (
            <div className="px-6 pt-8 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-[#4a154b]/60 flex items-center justify-center shrink-0">
                  <span className="text-2xl font-bold text-white">#</span>
                </div>
                <span className="text-2xl font-bold text-white">{channel.name}</span>
              </div>
              <p className="text-white font-semibold text-lg mb-1">
                This is the very beginning of #{channel.name}
              </p>
              {channel.description && (
                <p className="text-slate-400 text-sm mb-1">{channel.description}</p>
              )}
              {channel.createdAt && (
                <p className="text-slate-500 text-xs">
                  Channel created on {new Date(channel.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
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
            placeholder={`Message ${channel?.name ?? ''}`}
            channelId={channelId}
          />
        </div>

        {/* Canvas Panel — only mount once channelId has resolved to avoid
            firing `/api/channels//canvas(es)` with an empty segment. */}
        {canvasOpen && channelId && (
          <CanvasEditor
            channelId={channelId}
            onClose={() => setCanvasOpen(false)}
          />
        )}

        {/* Thread Panel */}
        {activeThread && (
          <ThreadPanel
            channelId={channelId}
            channelName={channel?.name}
            parentMessageId={activeThread}
            parentMessageContent={activeMessage?.content}
          />
        )}

        {/* Channel Detail Panel */}
        {detailPanelOpen && (
          <div className="fixed inset-y-0 right-0 z-30 lg:relative lg:inset-auto lg:z-auto">
            <ChannelDetailPanel
              channelId={channelId}
              channelName={channel?.name ?? ''}
              channelDescription={channel?.description}
              createdAt={channel?.createdAt}
              members={channelData?.members ?? []}
              messages={messages}
              isAdmin={true}
              isArchived={channel?.isArchived}
              onClose={() => setDetailPanelOpen(false)}
              onArchiveToggle={handleArchiveToggle}
            />
          </div>
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
