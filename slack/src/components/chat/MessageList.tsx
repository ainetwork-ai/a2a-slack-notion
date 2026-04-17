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
  /** Called when user is at the bottom and new messages are visible. */
  onMessagesViewed?: () => void;
}

function DateSeparator({ date }: { date: Date }) {
  let label: string;
  if (isToday(date)) label = 'Today';
  else if (isYesterday(date)) label = 'Yesterday';
  else label = format(date, 'MMMM d, yyyy');

  return (
    <div className="flex items-center gap-3 px-4 py-2 my-2">
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--slack-border)' }} />
      <span className="text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap shadow-sm select-none" style={{ backgroundColor: 'var(--slack-bg-tertiary)', color: 'var(--slack-text-secondary)', border: '1px solid var(--slack-border)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--slack-border)' }} />
    </div>
  );
}

function NewMessageDivider() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 my-1">
      <div className="flex-1 h-px bg-[#1d9bd1]/60" />
      <span className="text-xs text-[#1d9bd1] font-semibold px-2 py-0.5 bg-[#1d9bd1]/10 border border-[#1d9bd1]/30 rounded-full whitespace-nowrap">
        New
      </span>
      <div className="flex-1 h-px bg-[#1d9bd1]/60" />
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
  onMessagesViewed,
}: MessageListProps) {
  const { user } = useAuth();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
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
      // Use requestAnimationFrame to ensure DOM has rendered — instant jump on first load
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      });
      hasScrolledInitially.current = true;
      prevLengthRef.current = messages.length;
      prevScrollHeightRef.current = el.scrollHeight;
      return;
    }

    if (messages.length > prevLengthRef.current) {
      const added = messages.length - prevLengthRef.current;
      const prevScrollHeight = prevScrollHeightRef.current;

      requestAnimationFrame(() => {
        // If messages were prepended (loadMore), preserve scroll position
        if (el.scrollTop < 50 && added > 1) {
          const newScrollHeight = el.scrollHeight;
          el.scrollTo({ top: newScrollHeight - prevScrollHeight, behavior: 'instant' });
        } else {
          // New message appended — auto-scroll only if near bottom
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceFromBottom <= 100) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            // User is at bottom → they see the new message → mark as read
            onMessagesViewed?.();
          } else {
            setShowJumpButton(true);
          }
        }
        prevScrollHeightRef.current = el.scrollHeight;
      });
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
        onMessagesViewed?.();
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

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const el = scrollAreaRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
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
          onClick={() => scrollToBottom('smooth')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs font-medium rounded-full shadow-lg transition-colors"
        >
          ↓ New messages
        </button>
      </div>
    )}
    </div>
  );
}
