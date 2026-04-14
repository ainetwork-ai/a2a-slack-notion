'use client';

import { useState, use, useEffect } from 'react';
import { Bot, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ThreadPanel from '@/components/chat/ThreadPanel';
import AgentSkillPicker from '@/components/agent/AgentSkillPicker';
import { AgentSkill } from '@/components/agent/AgentSkillPicker';
import { useMessages } from '@/lib/hooks/use-messages';
import { useTyping } from '@/lib/realtime/use-typing';
import { usePresence } from '@/lib/realtime/use-presence';
import { useAppStore } from '@/lib/stores/app-store';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Conversation {
  id: string;
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    isAgent?: boolean;
  };
  agentSkills?: AgentSkill[];
}

export default function DMPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const { activeThread } = useAppStore();
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);

  useEffect(() => {
    fetch(`/api/dm/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead' }),
    });
  }, [conversationId]);

  const { data: convoData } = useSWR<{ conversation: Conversation }>(
    `/api/dm/${conversationId}`,
    fetcher
  );

  const conversation = convoData?.conversation;
  const otherUser = conversation?.otherUser;
  const isAgent = otherUser?.isAgent ?? false;

  const { messages, isLoading, hasMore, sendMessage, editMessage, deleteMessage, loadMore } =
    useMessages({ conversationId });

  const { typingUsers } = useTyping(undefined, conversationId);
  const { isOnline } = usePresence();

  const online = otherUser ? isOnline(otherUser.id) : false;

  const initials = otherUser?.displayName
    ? otherUser.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const activeMessage = activeThread
    ? messages.find(m => m.id === activeThread)
    : null;

  async function handleSend(content: string, metadata?: Record<string, unknown>) {
    await sendMessage(content, {
      ...metadata,
      ...(selectedSkill ? { skillId: selectedSkill.id, skillName: selectedSkill.name } : {}),
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* DM Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <Avatar className="w-7 h-7">
              {otherUser?.avatarUrl && (
                <AvatarImage src={otherUser.avatarUrl} alt={otherUser.displayName} />
              )}
              <AvatarFallback className={cn(
                'text-xs font-semibold',
                isAgent ? 'bg-[#36c5f0]/20 text-[#36c5f0]' : 'bg-[#4a154b] text-white'
              )}>
                {isAgent ? <Bot className="w-4 h-4" /> : initials}
              </AvatarFallback>
            </Avatar>
            <span className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1a1d21]',
              online ? 'bg-green-400' : 'bg-slate-500'
            )} />
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-white truncate">
              {otherUser?.displayName ?? '...'}
            </span>
            {isAgent && (
              <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30 shrink-0">
                Bot
              </Badge>
            )}
            <span className={cn(
              'text-xs shrink-0',
              online ? 'text-green-400' : 'text-slate-500'
            )}>
              {online ? 'Active' : 'Away'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isAgent && (
            <>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/10">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/10">
                <Video className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onEdit={editMessage}
            onDelete={deleteMessage}
          />
          <TypingIndicator typingUsers={typingUsers} />

          {/* Skill picker for agent conversations */}
          {isAgent && conversation?.agentSkills && (
            <AgentSkillPicker
              skills={conversation.agentSkills}
              selectedSkill={selectedSkill}
              onSelect={setSelectedSkill}
            />
          )}

          <MessageInput
            onSend={handleSend}
            placeholder={`Message ${otherUser?.displayName ?? ''}`}
            conversationId={conversationId}
          />
        </div>

        {/* Thread Panel */}
        {activeThread && (
          <ThreadPanel
            conversationId={conversationId}
            parentMessageId={activeThread}
            parentMessageContent={activeMessage?.content}
          />
        )}
      </div>
    </div>
  );
}
