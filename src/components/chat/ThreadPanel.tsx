'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MessageSquare } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { useMessages } from '@/lib/hooks/use-messages';
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
  const { activeThread, setActiveThread } = useAppStore();
  const { messages, isLoading, sendMessage, editMessage, deleteMessage } = useMessages({
    channelId,
    conversationId,
    parentId: parentMessageId,
  });
  const { typingUsers } = useTyping(channelId, conversationId);
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);

  const isOpen = activeThread === parentMessageId;

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
        <SheetHeader className="px-4 py-3 border-b border-white/10 flex flex-row items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-400" />
          <SheetTitle className="text-white text-base font-semibold">Thread</SheetTitle>
        </SheetHeader>

        {/* Parent message context */}
        {parentMessageContent && (
          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <p className="text-xs text-slate-400 mb-1">Original message</p>
            <p className="text-sm text-slate-200 line-clamp-3">{parentMessageContent}</p>
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
              <label htmlFor="also-send-channel" className="text-xs text-slate-400 cursor-pointer select-none">
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
