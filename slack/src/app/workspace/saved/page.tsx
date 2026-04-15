'use client';

import { format } from 'date-fns';
import { Bookmark, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BookmarkEntry {
  id: string;
  createdAt: string;
  message: {
    id: string;
    content: string;
    contentType: string;
    channelId: string | null;
    conversationId: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  };
  sender: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    isAgent: boolean;
  };
}

export default function SavedPage() {
  const { data, isLoading, mutate } = useSWR<{ bookmarks: BookmarkEntry[] }>(
    '/api/bookmarks',
    fetcher
  );
  const items = data?.bookmarks ?? [];

  async function handleRemove(messageId: string) {
    await fetch('/api/bookmarks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    });
    mutate();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <Bookmark className="w-5 h-5 text-slate-400" />
        <span className="font-semibold text-white">Saved Items</span>
        {items.length > 0 && (
          <span className="text-xs text-slate-500 ml-1">{items.length}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
            Loading saved items...
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 px-8 text-center">
            <Bookmark className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-base font-semibold text-white">No saved items yet</p>
            <p className="text-sm">
              Hover over any message and click the bookmark icon to save it here.
            </p>
          </div>
        )}

        {items.map((item) => {
          const initials = item.sender.displayName
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          return (
            <div
              key={item.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors group"
            >
              <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                {item.sender.avatarUrl && (
                  <AvatarImage src={item.sender.avatarUrl} alt={item.sender.displayName} />
                )}
                <AvatarFallback
                  className={
                    item.sender.isAgent
                      ? 'bg-[#36c5f0]/20 text-[#36c5f0] text-xs font-semibold'
                      : 'bg-[#4a154b] text-white text-xs font-semibold'
                  }
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-white text-sm">
                    {item.sender.displayName}
                  </span>
                  <span className="text-xs text-slate-500">
                    {format(new Date(item.message.createdAt), 'MMM d, h:mm a')}
                  </span>
                  <span className="text-xs text-slate-600 ml-auto shrink-0">
                    Saved {format(new Date(item.createdAt), 'MMM d')}
                  </span>
                </div>
                <p className="text-slate-300 text-sm line-clamp-3 break-words">
                  {item.message.content}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 text-slate-500 hover:text-red-400 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => handleRemove(item.message.id)}
                title="Remove bookmark"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
