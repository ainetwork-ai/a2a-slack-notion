'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, ChevronDown, ChevronRight, Bot } from 'lucide-react';
import NewDMModal from '@/components/modals/NewDMModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePresence } from '@/lib/realtime/use-presence';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface DMConversation {
  id: string;
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    isAgent?: boolean;
  };
  lastMessage?: string;
  unread?: boolean;
}

export default function DMList() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [newDMOpen, setNewDMOpen] = useState(false);
  const { isOnline, fetchPresence } = usePresence();

  const { data } = useSWR<{ conversations: DMConversation[] }>(
    '/api/dm',
    fetcher,
    { refreshInterval: 3000, revalidateOnFocus: true }
  );

  const conversations = data?.conversations ?? [];

  useEffect(() => {
    const userIds = conversations
      .filter(c => !c.otherUser.isAgent)
      .map(c => c.otherUser.id);
    fetchPresence(userIds);
  }, [conversations.map(c => c.otherUser.id).join(',')]);

  function isActive(conversationId: string) {
    return pathname === `/workspace/dm/${conversationId}`;
  }

  return (
    <>
    <div className="px-2 py-1" data-section="dm">
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
          Direct Messages
        </button>
        <button
          onClick={() => setNewDMOpen(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#bcabbc] hover:text-white p-0.5 rounded"
          title="New direct message"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-0.5 space-y-px">
          {conversations.map(convo => {
            const online = isOnline(convo.otherUser.id);
            const initials = convo.otherUser.displayName
              .split(' ')
              .map(w => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <button
                key={convo.id}
                onClick={() => router.push(`/workspace/dm/${convo.id}`)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left',
                  isActive(convo.id)
                    ? 'bg-[#4a154b]/60 text-white'
                    : 'text-[#bcabbc] hover:bg-white/5 hover:text-white'
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="w-6 h-6">
                    {convo.otherUser.avatarUrl && (
                      <AvatarImage src={convo.otherUser.avatarUrl} alt={convo.otherUser.displayName} />
                    )}
                    <AvatarFallback className="bg-[#4a154b] text-white text-xs">
                      {convo.otherUser.isAgent ? <Bot className="w-3 h-3" /> : initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1a1d21]',
                      online ? 'bg-green-400' : 'bg-slate-500'
                    )}
                  />
                  {convo.otherUser.isAgent && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#36c5f0] flex items-center justify-center">
                      <Bot className="w-2 h-2 text-white" />
                    </span>
                  )}
                </div>
                <span className={cn('truncate flex-1', convo.unread && !isActive(convo.id) && 'font-semibold text-white')}>
                  {convo.otherUser.displayName}
                </span>
                {convo.unread && !isActive(convo.id) && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-white shrink-0" />
                )}
              </button>
            );
          })}

          {conversations.length === 0 && (
            <p className="text-xs text-slate-500 px-4 py-1">No conversations yet</p>
          )}
        </div>
      )}
    </div>
    <NewDMModal open={newDMOpen} onOpenChange={setNewDMOpen} />
    </>
  );
}
