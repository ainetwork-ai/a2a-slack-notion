'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageItem from './MessageItem';
import MessageSkeleton from './MessageSkeleton';
import { Message } from '@/lib/hooks/use-messages';
import { useAuth } from '@/lib/hooks/use-auth';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  isThreadView?: boolean;
  lastReadAt?: string | null;
  channelId?: string;
}

function DateSeparator({ date }: { date: Date }) {
  let label: string;
  if (isToday(date)) label = 'Today';
  else if (isYesterday(date)) label = 'Yesterday';
  else label = format(date, 'MMMM d, yyyy');

  return (
    <div className="flex items-center gap-3 px-4 py-2 my-2">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-[#1a1d21] border border-white/10 rounded-full whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

function NewMessageDivider() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 my-1">
      <div className="flex-1 h-px bg-red-500/60" />
      <span className="text-xs text-red-400 font-semibold px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded-full whitespace-nowrap">
        New
      </span>
      <div className="flex-1 h-px bg-red-500/60" />
    </div>
  );
}

export default function MessageList({
  messages,
  isLoading,
  hasMore,
  onLoadMore,
  onEdit,
  onDelete,
  isThreadView,
  lastReadAt,
  channelId,
}: MessageListProps) {
  const { user } = useAuth();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const hasScrolledInitially = useRef(false);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Reset initial scroll flag when message list changes context (e.g. channel switch)
  useEffect(() => {
    hasScrolledInitially.current = false;
    prevLengthRef.current = 0;
  }, [lastReadAt]); // lastReadAt changes per channel

  // Scroll to bottom when messages first load
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el || messages.length === 0) return;

    if (!hasScrolledInitially.current) {
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      hasScrolledInitially.current = true;
      prevLengthRef.current = messages.length;
      return;
    }

    // Auto-scroll on new messages only if near bottom
    if (messages.length > prevLengthRef.current) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom <= 150) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      } else {
        // Item 8: Show jump button when new messages arrive while scrolled up
        setShowJumpButton(true);
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Scroll to top detection for load more
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (el.scrollTop < 100 && hasMore && onLoadMore) {
        onLoadMore();
      }
      // Item 8: Hide jump button if user scrolls near bottom
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom <= 150) {
        setShowJumpButton(false);
      }
    },
    [hasMore, onLoadMore]
  );

  // Find first unread message id
  const firstUnreadId = lastReadAt
    ? messages.find(m => new Date(m.createdAt) > new Date(lastReadAt))?.id ?? null
    : null;

  // Group messages by date
  const groups: { date: Date; messages: Message[] }[] = [];
  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt);
    const last = groups[groups.length - 1];
    if (!last || !isSameDay(last.date, msgDate)) {
      groups.push({ date: msgDate, messages: [msg] });
    } else {
      last.messages.push(msg);
    }
  }

  function scrollToBottom() {
    const el = scrollAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowJumpButton(false);
  }

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
    <div
      className="message-area h-full overflow-y-auto scrollbar-slack"
      onScroll={handleScroll}
      ref={scrollAreaRef}
      aria-live="polite"
      aria-label="Message list"
    >
      {/* Load more indicator */}
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            onClick={onLoadMore}
            className="text-xs text-[#36c5f0] hover:underline"
          >
            Load older messages
          </button>
        </div>
      )}

      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
          <p className="text-lg font-semibold text-white">No messages yet</p>
          <p className="text-sm">Be the first to send a message!</p>
        </div>
      )}

      <div className="pb-4">
        {groups.map((group, gi) => (
          <div key={gi}>
            <DateSeparator date={group.date} />
            {group.messages.map((message, mi) => {
              const prev = mi > 0 ? group.messages[mi - 1] : null;
              const isCompact =
                !isThreadView &&
                prev !== null &&
                prev.senderId === message.senderId &&
                new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
              return (
                <div key={message.id}>
                  {firstUnreadId === message.id && <NewMessageDivider />}
                  <MessageItem
                    message={message}
                    currentUserId={user?.id}
                    currentUserName={user?.displayName}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isThreadView={isThreadView}
                    isCompact={isCompact}
                    channelId={channelId}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>

    {/* Item 8: Jump to new messages button */}
    {showJumpButton && (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={scrollToBottom}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs font-medium rounded-full shadow-lg transition-colors"
        >
          ↓ New messages
        </button>
      </div>
    )}
    </div>
  );
}
