'use client';

import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ThreadMessage {
  id: string;
  content: string;
  createdAt: string;
  parentId: string | null;
  channelId: string | null;
  conversationId: string | null;
  channelName: string | null;
  conversationName: string | null;
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export default function ThreadsPage() {
  const { data, isLoading } = useSWR<{ threads: ThreadMessage[] }>('/api/threads', fetcher);
  const threads = data?.threads ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <MessageSquare className="w-5 h-5 text-slate-400" />
        <span className="font-semibold text-white">Threads</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Loading threads...
          </div>
        )}

        {!isLoading && threads.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 px-8 text-center">
            <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-base font-semibold text-white">No threads yet</p>
            <p className="text-sm">When you reply to messages or start threads, they&apos;ll appear here.</p>
          </div>
        )}

        {threads.map((msg) => {
          const initials = msg.user.displayName
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
          const location = msg.channelName
            ? `#${msg.channelName}`
            : msg.conversationName
            ? msg.conversationName
            : 'Direct Message';

          return (
            <div
              key={msg.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors"
            >
              <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                {msg.user.avatarUrl && (
                  <AvatarImage src={msg.user.avatarUrl} alt={msg.user.displayName} />
                )}
                <AvatarFallback className="bg-[#4a154b] text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-white text-sm">{msg.user.displayName}</span>
                  <span className="text-xs text-slate-500">
                    {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                  </span>
                  <span className="text-xs text-[#36c5f0] ml-auto shrink-0">{location}</span>
                </div>
                <p className="text-slate-300 text-sm truncate">{msg.content}</p>
                {msg.parentId && (
                  <span className="text-xs text-slate-500 mt-0.5 inline-block">Thread reply</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
