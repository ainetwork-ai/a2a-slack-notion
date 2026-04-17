'use client';

import { useState, use, useEffect, useRef } from 'react';
import { Bot, Phone, Video, Users, Bell, BellOff, FileJson, Trash2, Copy, Check, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import MessageList from '@/components/chat/MessageList';
import MessageInput from '@/components/chat/MessageInput';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ThreadPanel from '@/components/chat/ThreadPanel';
import { pushRecentVisit } from '@/lib/hooks/use-recent-visits';
import AgentSkillPicker from '@/components/agent/AgentSkillPicker';
import { AgentSkill } from '@/components/agent/AgentSkillPicker';
import { useMessages } from '@/lib/hooks/use-messages';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTyping } from '@/lib/realtime/use-typing';
import { usePresence } from '@/lib/realtime/use-presence';
import { useAppStore } from '@/lib/stores/app-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAgentStream } from '@/lib/realtime/use-agent-stream';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ConversationMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isAgent?: boolean;
  status?: string;
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
  const { conversationId: urlParam } = use(params);
  const dmParam = decodeURIComponent(urlParam);
  const { user: authUser } = useAuth();
  const { activeThread } = useAppStore();
  const { workspaces, activeWorkspaceName } = useWorkspaceStore();
  const activeWorkspace = workspaces.find(w => w.name === activeWorkspaceName);
  const isWorkspaceOwner = activeWorkspace?.role === 'owner';
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const lastReadAtRef = useRef<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [togglingMute, setTogglingMute] = useState(false);
  const [agentCardOpen, setAgentCardOpen] = useState(false);
  const [agentCardJson, setAgentCardJson] = useState<Record<string, unknown> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [cardUrlCopied, setCardUrlCopied] = useState(false);

  const { data: convoData, mutate: mutateConvo } = useSWR<{ conversation: Conversation }>(
    `/api/dm/${encodeURIComponent(dmParam)}`,
    fetcher
  );

  const conversation = convoData?.conversation;
  const conversationId = conversation?.id ?? '';

  useEffect(() => {
    if (!conversationId) return;
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

  // Keep lastReadAt fresh while viewing — mark as read whenever new messages arrive
  // (uses `messages` from the useMessages hook below via a separate effect that
  //  watches the latest message ID)
  const latestMsgRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversation?.isMuted !== undefined) {
      setIsMuted(conversation.isMuted);
    }
  }, [conversation?.isMuted]);

  // Track DM visits for Cmd+K switcher
  useEffect(() => {
    if (conversation?.otherUser?.displayName && conversationId) {
      pushRecentVisit({
        type: 'dm',
        id: conversationId,
        label: conversation.otherUser.displayName,
      });
    }
  }, [conversationId, conversation?.otherUser?.displayName]);

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

  // Fetch agent card + ownership info for bot agents
  useEffect(() => {
    if (!isAgent || !otherUser?.id) return;
    fetch(`/api/agents/${otherUser.id}`)
      .then(r => r.json())
      .then(data => {
        const card = data.agentCardJson;
        if (card) {
          setAgentCardJson(card as Record<string, unknown>);
          setIsOwner(card.builtBy === authUser?.id);
        }
      })
      .catch(() => {});
  }, [isAgent, otherUser?.id, authUser?.id]);

  async function handleDeleteAgent() {
    if (!otherUser?.id) return;
    if (!confirm(`Delete agent "${otherUser.displayName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/agents/${otherUser.id}`, { method: 'DELETE' });
    if (res.ok) {
      window.location.href = '/workspace';
    }
  }

  const { messages, isLoading, hasMore, sendMessage, editMessage, deleteMessage, loadMore } =
    useMessages({ conversationId, currentUser: authUser ? { id: authUser.id, displayName: authUser.displayName, avatarUrl: authUser.avatarUrl } : undefined });

  // Mark as read whenever new messages arrive while viewing
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const newest = messages[0]?.id;
    if (newest && newest !== latestMsgRef.current) {
      latestMsgRef.current = newest;
      fetch(`/api/dm/${conversationId}/read`, { method: 'PATCH' }).catch(() => {});
    }
  }, [conversationId, messages]);

  const { typingUsers } = useTyping(undefined, conversationId);
  const { isOnline } = usePresence();
  // For agents, use the DB status field; for humans, use real-time presence
  const online = otherUser
    ? (isAgent ? otherUser.status === "online" : isOnline(otherUser.id))
    : false;
  const agentStream = useAgentStream();

  // Inject a synthetic typing entry for the agent while waiting for a response
  const agentTypingUsers = (isAgent && otherUser && agentStream.isStreaming && !agentStream.content)
    ? [...typingUsers, { userId: otherUser.id, displayName: otherUser.displayName }]
    : typingUsers;

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

    // Start streaming for agent responses
    if (isAgent && otherUser?.id) {
      agentStream.reset();
      agentStream.startStream({
        agentId: otherUser.id,
        text: content,
        conversationId,
        skillId: selectedSkill?.id,
        senderName: authUser?.displayName,
      });
    }
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
          {isAgent && agentCardJson && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-slate-400 hover:text-[#36c5f0] hover:bg-white/10"
              onClick={() => setAgentCardOpen(!agentCardOpen)}
              title="View Agent Card"
            >
              <FileJson className="w-4 h-4" />
            </Button>
          )}
          {isAgent && (isOwner || isWorkspaceOwner) && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-slate-400 hover:text-red-400 hover:bg-white/10"
              onClick={handleDeleteAgent}
              title="Delete agent"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Agent Card JSON Viewer */}
      {agentCardOpen && agentCardJson && (
        <div className="border-b border-white/5 bg-[#0d1117] px-4 py-3 max-h-80 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent Card (A2A)</span>
            <button onClick={() => setAgentCardOpen(false)} className="text-xs text-slate-500 hover:text-white">Close</button>
          </div>
          {/* Well-known URL */}
          <div className="flex items-center gap-2 mb-3 bg-[#161b22] border border-white/10 rounded-lg px-3 py-2">
            <Link className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <code className="text-[11px] text-[#36c5f0] flex-1 truncate">
              {typeof window !== 'undefined' ? `${window.location.origin}/api/agents/${otherUser?.id}/card` : `/api/agents/${otherUser?.id}/card`}
            </code>
            <button
              onClick={() => {
                const url = `${window.location.origin}/api/agents/${otherUser?.id}/card`;
                navigator.clipboard.writeText(url);
                setCardUrlCopied(true);
                setTimeout(() => setCardUrlCopied(false), 2000);
              }}
              className="shrink-0 text-slate-400 hover:text-white transition-colors"
              title="Copy URL"
            >
              {cardUrlCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <pre className="text-xs text-[#36c5f0] font-mono whitespace-pre-wrap leading-relaxed">
            {JSON.stringify(agentCardJson, null, 2)}
          </pre>
        </div>
      )}

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
          <TypingIndicator typingUsers={agentTypingUsers} />

          {/* Agent streaming response */}
          {isAgent && (agentStream.isStreaming || agentStream.content) && (
            <div className="px-5 py-2">
              <div className="flex items-start gap-2.5">
                <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm font-semibold text-white">{otherUser?.displayName}</span>
                    <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30">Bot</Badge>
                    {agentStream.status && (
                      <span className="text-[11px] text-slate-500 italic">{agentStream.status}</span>
                    )}
                  </div>
                  {agentStream.content ? (
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{agentStream.content}<span className={agentStream.isStreaming ? 'animate-pulse' : ''}>|</span></p>
                  ) : agentStream.isStreaming ? (
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-[#36c5f0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-[#36c5f0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-[#36c5f0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

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
