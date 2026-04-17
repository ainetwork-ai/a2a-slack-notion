'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MessageSquare, Bell, BellOff, X, Hash } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { useMessages } from '@/lib/hooks/use-messages';
import { useAuth } from '@/lib/hooks/use-auth';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import { useTyping } from '@/lib/realtime/use-typing';

interface ThreadPanelProps {
  channelId?: string;
  channelName?: string;
  conversationId?: string;
  parentMessageId: string;
  parentMessageContent?: string;
}

export default function ThreadPanel({
  channelId,
  channelName,
  conversationId,
  parentMessageId,
  parentMessageContent,
}: ThreadPanelProps) {
  const { user: authUser } = useAuth();
  const { activeThread, setActiveThread } = useAppStore();
  const { messages, isLoading, sendMessage, editMessage, deleteMessage } = useMessages({
    channelId,
    conversationId,
    parentId: parentMessageId,
    currentUser: authUser ? { id: authUser.id, displayName: authUser.displayName, avatarUrl: authUser.avatarUrl } : undefined,
  });
  const { typingUsers } = useTyping(channelId, conversationId);
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);

  const isOpen = activeThread === parentMessageId;

  // Fetch subscription status when thread opens
  useEffect(() => {
    if (!isOpen || !parentMessageId) return;
    fetch(`/api/thread-subscriptions?messageId=${parentMessageId}`)
      .then(r => r.json())
      .then(data => setIsSubscribed(!!data.subscribed))
      .catch(() => {});
  }, [isOpen, parentMessageId]);

  async function handleToggleSubscription() {
    setSubscribeLoading(true);
    try {
      if (isSubscribed) {
        await fetch('/api/thread-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: parentMessageId }),
        });
        setIsSubscribed(false);
      } else {
        await fetch('/api/thread-subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: parentMessageId }),
        });
        setIsSubscribed(true);
      }
    } catch {
      // ignore
    } finally {
      setSubscribeLoading(false);
    }
  }

  async function handleSend(content: string, metadata?: Record<string, unknown>) {
    await sendMessage(content, metadata);

    // T9: Also send to channel when checkbox is checked
    if (alsoSendToChannel && channelId) {
      const endpoint = `/api/channels/${channelId}/messages`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, metadata }),
      });
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && setActiveThread(null)}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[480px] bg-[#1a1d21] border-l border-white/10 p-0 flex flex-col"
        showCloseButton={false}
      >
        <SheetHeader className="px-4 h-12 border-b border-white/10 flex flex-row items-center gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <MessageSquare className="w-[18px] h-[18px] text-slate-400 shrink-0" />
            <SheetTitle className="text-white text-[17px] font-bold shrink-0">Thread</SheetTitle>
            {channelName && (
              <span className="flex items-center gap-0.5 text-sm text-slate-400 min-w-0">
                <span className="text-slate-500 shrink-0">in</span>
                <Hash className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate hover:underline cursor-default" title={channelName}>
                  {channelName}
                </span>
              </span>
            )}
          </div>
          <button
            onClick={handleToggleSubscription}
            disabled={subscribeLoading}
            title={isSubscribed ? 'Unfollow thread' : 'Follow thread'}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 shrink-0"
          >
            {isSubscribed ? (
              <>
                <BellOff className="w-3.5 h-3.5" />
                <span>Unfollow</span>
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5" />
                <span>Follow</span>
              </>
            )}
          </button>
          <button
            onClick={() => setActiveThread(null)}
            title="Close thread"
            aria-label="Close thread"
            className="flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </SheetHeader>

        {/* Parent message context */}
        {parentMessageContent && (
          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <p className="text-xs text-slate-400 mb-1">Original message</p>
            <p className="text-[15px] text-slate-200 line-clamp-3 leading-relaxed">{parentMessageContent}</p>
          </div>
        )}

        {/* Thread messages */}
        <div className="flex-1 flex flex-col min-h-0">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            onEdit={editMessage}
            onDelete={deleteMessage}
            isThreadView
          />
          <TypingIndicator typingUsers={typingUsers} />

          {/* T9: Also send to channel checkbox */}
          {channelId && (
            <div className="px-4 pb-1 flex items-center gap-2">
              <input
                id="also-send-channel"
                type="checkbox"
                checked={alsoSendToChannel}
                onChange={e => setAlsoSendToChannel(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#4a154b] cursor-pointer"
              />
              <label htmlFor="also-send-channel" className="text-sm text-slate-400 cursor-pointer select-none">
                Also send to {channelName ? `#${channelName}` : 'channel'}
              </label>
            </div>
          )}

          <MessageInput
            onSend={handleSend}
            placeholder="Reply in thread..."
            channelId={channelId}
            conversationId={conversationId}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
