'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DMConversation {
  id: string;
  updatedAt: string;
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    isAgent: boolean;
  } | null;
  latestMessage?: {
    content: string;
    createdAt: string;
  } | null;
  unreadCount?: number;
  isGroup: boolean;
  members: { displayName: string; avatarUrl?: string | null; isAgent: boolean; userId: string }[];
}

export default function DMsPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<DMConversation[]>('/api/dm', fetcher);
  const conversations = Array.isArray(data) ? data : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <MessageSquare className="w-5 h-5 text-slate-400" />
        <span className="font-semibold text-white">Direct Messages</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Loading conversations...
          </div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 px-8 text-center">
            <MessageSquare className="w-12 h-12 mb-2 opacity-30" />
            <p className="text-base font-semibold text-white">No direct messages yet</p>
            <p className="text-sm text-slate-400">
              Start a conversation by clicking on a user in a channel.
            </p>
          </div>
        )}

        {conversations.map((conv) => {
          const displayUser = conv.otherUser;
          const name = displayUser?.displayName ?? 'Group DM';
          const initials = name
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          return (
            <button
              key={conv.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors text-left"
              onClick={() => router.push(`/workspace/dm/${conv.id}`)}
            >
              <Avatar className="w-9 h-9 shrink-0">
                {displayUser?.avatarUrl && (
                  <AvatarImage src={displayUser.avatarUrl} alt={name} />
                )}
                <AvatarFallback
                  className={
                    displayUser?.isAgent
                      ? 'bg-[#36c5f0]/20 text-[#36c5f0] text-xs font-semibold'
                      : 'bg-[#4a154b] text-white text-xs font-semibold'
                  }
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold text-white text-sm truncate">{name}</span>
                  {conv.latestMessage && (
                    <span className="text-xs text-slate-500 shrink-0 ml-2">
                      {format(new Date(conv.latestMessage.createdAt), 'MMM d')}
                    </span>
                  )}
                </div>
                {conv.latestMessage && (
                  <p className="text-slate-400 text-xs truncate">{conv.latestMessage.content}</p>
                )}
              </div>
              {conv.unreadCount && conv.unreadCount > 0 ? (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shrink-0">
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
