'use client';

import { useState, use, useEffect, useRef } from 'react';
import { Bot, Phone, Video, Users, Bell, BellOff } from 'lucide-react';
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

interface ConversationMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isAgent?: boolean;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  otherUser: ConversationMember | null;
  members: ConversationMember[];
  otherMembers: ConversationMember[];
  agentSkills?: AgentSkill[];
  isMuted?: boolean;
}

export default function DMPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const { activeThread } = useAppStore();
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const lastReadAtRef = useRef<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [togglingMute, setTogglingMute] = useState(false);

  useEffect(() => {
    // Mark as read and capture the previous lastReadAt in one call
    fetch(`/api/dm/${conversationId}/read`, { method: 'PATCH' })
      .then(r => r.json())
      .then((data: { previousLastReadAt?: string | null }) => {
        if (data.previousLastReadAt) {
          lastReadAtRef.current = typeof data.previousLastReadAt === 'string'
            ? data.previousLastReadAt
            : (data.previousLastReadAt as Date).toISOString();
        }
      })
      .catch(() => {});
  }, [conversationId]);

  const { data: convoData } = useSWR<{ conversation: Conversation }>(
    `/api/dm/${conversationId}`,
    fetcher
  );

  const conversation = convoData?.conversation;

  useEffect(() => {
    if (conversation?.isMuted !== undefined) {
      setIsMuted(conversation.isMuted);
    }
  }, [conversation?.isMuted]);

  async function handleToggleMute() {
    if (togglingMute) return;
    setTogglingMute(true);
    try {
      const res = await fetch(`/api/dm/${conversationId}/mute`, { method: 'PATCH' });
      if (res.ok) {
        const data = await res.json() as { isMuted: boolean };
        setIsMuted(data.isMuted);
      }
    } finally {
      setTogglingMute(false);
    }
  }
  const isGroup = conversation?.isGroup ?? false;
  const otherUser = conversation?.otherUser;
  const otherMembers = conversation?.otherMembers ?? [];
  const isAgent = otherUser?.isAgent ?? false;

  const { messages, isLoading, hasMore, sendMessage, editMessage, deleteMessage, loadMore } =
    useMessages({ conversationId });

  const { typingUsers } = useTyping(undefined, conversationId);
  const { isOnline } = usePresence();

  const online = otherUser ? isOnline(otherUser.id) : false;

  // Header display values
  const headerTitle = isGroup
    ? (otherMembers.length > 0
        ? otherMembers.map(m => m.displayName).join(', ')
        : conversation?.members?.map(m => m.displayName).join(', ') ?? 'Group')
    : (otherUser?.displayName ?? '...');

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
            {isGroup ? (
              <div className="w-7 h-7 rounded bg-[#4a154b]/60 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#bcabbc]" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-white truncate">
              {headerTitle}
            </span>
            {isGroup && conversation?.members && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-white/10 text-[#bcabbc] border-white/10 shrink-0">
                {conversation.members.length} members
              </Badge>
            )}
            {!isGroup && isAgent && (
              <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30 shrink-0">
                Bot
              </Badge>
            )}
            {!isGroup && (
              <span className={cn(
                'text-xs shrink-0',
                online ? 'text-green-400' : 'text-slate-500'
              )}>
                {online ? 'Active' : 'Away'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isGroup && !isAgent && (
            <>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/10">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/10">
                <Video className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn('w-8 h-8 hover:bg-white/10', isMuted ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-400 hover:text-white')}
            onClick={handleToggleMute}
            disabled={togglingMute}
            title={isMuted ? 'Unmute conversation' : 'Mute conversation'}
          >
            {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Welcome banner when no messages */}
          {!isLoading && messages.length === 0 && (
            <div className="px-6 pt-8 pb-4">
              {isGroup ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-lg bg-[#4a154b]/60 flex items-center justify-center">
                      <Users className="w-6 h-6 text-[#bcabbc]" />
                    </div>
                    <span className="text-2xl font-bold text-white truncate">{headerTitle}</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    This is the beginning of your group conversation with{' '}
                    <span className="font-semibold text-white">{headerTitle}</span>.
                  </p>
                </>
              ) : otherUser ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar className="w-12 h-12">
                      {otherUser.avatarUrl && (
                        <AvatarImage src={otherUser.avatarUrl} alt={otherUser.displayName} />
                      )}
                      <AvatarFallback className={cn('text-lg font-semibold', isAgent ? 'bg-[#36c5f0]/20 text-[#36c5f0]' : 'bg-[#4a154b] text-white')}>
                        {isAgent ? <Bot className="w-6 h-6" /> : otherUser.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-2xl font-bold text-white">{otherUser.displayName}</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    This is the beginning of your conversation with <span className="font-semibold text-white">{otherUser.displayName}</span>.
                  </p>
                </>
              ) : null}
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
          />
          <TypingIndicator typingUsers={typingUsers} />

          {/* Skill picker for agent conversations */}
          {!isGroup && isAgent && conversation?.agentSkills && (
            <AgentSkillPicker
              skills={conversation.agentSkills}
              selectedSkill={selectedSkill}
              onSelect={setSelectedSkill}
            />
          )}

          <MessageInput
            onSend={handleSend}
            placeholder={isGroup ? `Message ${headerTitle}` : `Message ${otherUser?.displayName ?? ''}`}
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
