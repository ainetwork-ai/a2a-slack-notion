'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Ban,
  Bot,
  Check,
  CheckCircle,
  Copy,
  Crown,
  Hash,
  Lock,
  MessageSquare,
  Pencil,
  Shield,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

interface UserProfilePopupProps {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  statusEmoji?: string;
  statusMessage?: string;
  isAgent?: boolean;
  /** Preferred key for agent lookup — a2aId or UUID. */
  agentKey?: string;
  agentDescription?: string;
  agentSkills?: string[];
  children: React.ReactNode;
}

interface SkillFull {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
}

interface AgentDetail {
  id: string;
  a2aId: string | null;
  a2aUrl: string | null;
  ainAddress: string;
  displayName: string;
  avatarUrl: string | null;
  agentCardJson: {
    description?: string;
    version?: string;
    provider?: { organization?: string };
    capabilities?: {
      streaming?: boolean;
      pushNotifications?: boolean;
      stateTransitionHistory?: boolean;
    };
    skills?: SkillFull[];
    builtBy?: string;
  } | null;
  agentInvitedBy: string | null;
  agentVisibility: 'public' | 'private' | 'unlisted' | null;
  agentCategory: string | null;
  agentTags: string[] | null;
  skills: SkillFull[];
  owner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    ainAddress: string;
  } | null;
  viewerPermission: 'owner' | 'workspace_admin' | 'viewer';
}

interface AgentChannel {
  channelId: string;
  channelName: string;
  isPrivate: boolean;
  engagementLevel: number | null;
  autoResponseCount: number | null;
  lastAutoResponseAt: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ENGAGEMENT_LABELS = ['Silent', 'Reactive', 'Engaged', 'Proactive'] as const;
const ENGAGEMENT_COLORS = [
  'bg-slate-500/20 text-slate-400',
  'bg-blue-500/20 text-blue-400',
  'bg-green-500/20 text-green-400',
  'bg-purple-500/20 text-purple-400',
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="text-slate-500 hover:text-white transition-colors shrink-0"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function UserProfilePopup({
  userId,
  displayName,
  avatarUrl,
  statusEmoji,
  statusMessage,
  isAgent,
  agentKey,
  agentDescription,
  agentSkills,
  children,
}: UserProfilePopupProps) {
  const router = useRouter();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockLoading, setIsBlockLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Lazy-load full agent detail only when the popup opens and this is a bot.
  const agentLookupKey = agentKey || userId;
  const { data: agent } = useSWR<AgentDetail>(
    isAgent && open ? `/api/agents/${encodeURIComponent(agentLookupKey)}` : null,
    fetcher
  );
  const { data: channels } = useSWR<AgentChannel[]>(
    isAgent && open ? `/api/agents/${encodeURIComponent(agentLookupKey)}/channels` : null,
    fetcher
  );

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  useEffect(() => {
    if (!userId || isAgent) return;
    fetch('/api/users/block')
      .then((r) => r.json())
      .then((data) => {
        const blocked: { blockedUserId: string }[] = data.blockedUsers ?? [];
        setIsBlocked(blocked.some((b) => b.blockedUserId === userId));
      })
      .catch(() => {});
  }, [userId, isAgent]);

  async function handleSendMessage() {
    try {
      // Prefer a2aId for agents so the URL reads cleanly
      const target = isAgent && agent?.a2aId ? agent.a2aId : userId;
      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: target }),
      });
      if (res.ok) {
        const data = await res.json();
        const key = data.dmKey || data.id;
        router.push(`/workspace/dm/${encodeURIComponent(key)}`);
      }
    } catch {
      // silently fail
    }
  }

  async function handleToggleBlock() {
    setIsBlockLoading(true);
    try {
      const res = await fetch('/api/users/block', {
        method: isBlocked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedUserId: userId }),
      });
      if (res.ok) setIsBlocked((prev) => !prev);
    } finally {
      setIsBlockLoading(false);
    }
  }

  async function handleDeleteAgent() {
    if (!agent) return;
    if (!confirm(`Delete agent "${agent.displayName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.a2aId || agent.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setOpen(false);
      router.push('/workspace');
    }
  }

  const card = agent?.agentCardJson ?? null;
  const fullSkills: SkillFull[] = agent?.skills ?? card?.skills ?? [];
  const description = card?.description ?? agentDescription ?? '';
  const a2aUrl =
    agent?.a2aUrl ??
    (agent?.a2aId && typeof window !== 'undefined'
      ? `${window.location.origin}/api/a2a/${agent.a2aId}`
      : null);

  const popupWidth = isAgent ? 'w-96' : 'w-72';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children as React.ReactElement}></PopoverTrigger>
      <PopoverContent
        className={cn(popupWidth, 'p-0 bg-[#222529] border-white/10 shadow-xl max-h-[75vh] overflow-y-auto')}
        align="start"
        side="bottom"
      >
        {/* Header banner */}
        <div className={`h-16 ${isAgent ? 'bg-[#36c5f0]/20' : 'bg-[#4a154b]/30'} rounded-t-lg`} />

        <div className="px-4 pb-4">
          {/* Avatar overlapping banner */}
          <div className="-mt-8 mb-3 flex items-end justify-between">
            <Avatar className="w-16 h-16 border-4 border-[#222529]">
              {(agent?.avatarUrl || avatarUrl) && (
                <AvatarImage src={(agent?.avatarUrl || avatarUrl) ?? undefined} alt={displayName} />
              )}
              <AvatarFallback
                className={cn(
                  'text-lg font-semibold',
                  isAgent ? 'bg-[#36c5f0]/20 text-[#36c5f0]' : 'bg-[#4a154b] text-white'
                )}
              >
                {isAgent ? <Bot className="w-7 h-7" /> : initials}
              </AvatarFallback>
            </Avatar>

            {/* Viewer permission badge — for agents only */}
            {isAgent && agent && (
              <div className="mb-1">
                {agent.viewerPermission === 'owner' && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full">
                    <Crown className="w-2.5 h-2.5" />
                    Owner
                  </span>
                )}
                {agent.viewerPermission === 'workspace_admin' && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">
                    <Shield className="w-2.5 h-2.5" />
                    Workspace admin
                  </span>
                )}
                {agent.viewerPermission === 'viewer' && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-white/5 text-slate-500 rounded-full">
                    Viewer
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Name + Bot badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white text-base">{displayName}</span>
            {isAgent && (
              <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30">
                Bot
              </Badge>
            )}
            {isAgent && agent?.agentVisibility === 'public' && (
              <Badge className="text-[10px] px-1 py-0 h-4 bg-green-500/10 text-green-400 border-green-500/30">
                Public
              </Badge>
            )}
          </div>

          {/* Human status */}
          {!isAgent && (statusEmoji || statusMessage) && (
            <div className="flex items-center gap-1.5 text-sm text-slate-300 mb-2">
              {statusEmoji && <span className="text-base leading-none">{statusEmoji}</span>}
              {statusMessage && <span>{statusMessage}</span>}
            </div>
          )}

          {/* Agent description */}
          {isAgent && description && (
            <p className="text-slate-400 text-xs mb-3 leading-relaxed">{description}</p>
          )}

          {/* Agent identifiers */}
          {isAgent && agent && (
            <div className="space-y-1 mb-3 text-[11px] font-mono">
              {agent.a2aId && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="text-slate-600">a2aId</span>
                  <span className="text-[#36c5f0] truncate flex-1">{agent.a2aId}</span>
                  <CopyButton value={agent.a2aId} label="a2aId" />
                </div>
              )}
              {agent.ainAddress && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="text-slate-600">AIN</span>
                  <span className="text-[#e879f9] truncate flex-1">{agent.ainAddress}</span>
                  <CopyButton value={agent.ainAddress} label="AIN address" />
                </div>
              )}
              {a2aUrl && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="text-slate-600">URL</span>
                  <a
                    href={a2aUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 truncate flex-1 hover:text-white underline-offset-2 hover:underline"
                  >
                    {a2aUrl.replace(/^https?:\/\//, '')}
                  </a>
                  <CopyButton value={a2aUrl} label="agent URL" />
                </div>
              )}
            </div>
          )}

          {/* Owner */}
          {isAgent && agent?.owner && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-slate-500">Built by</span>
              <Avatar className="w-4 h-4">
                {agent.owner.avatarUrl && (
                  <AvatarImage src={agent.owner.avatarUrl} alt={agent.owner.displayName} />
                )}
                <AvatarFallback className="bg-[#4a154b] text-white text-[8px]">
                  {agent.owner.displayName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-slate-300 truncate">{agent.owner.displayName}</span>
            </div>
          )}

          {/* Skills (full) */}
          {isAgent && fullSkills.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Skills
              </p>
              <div className="space-y-2">
                {fullSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="bg-white/5 rounded-md px-2.5 py-2 border border-white/5"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-white">{skill.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{skill.id}</span>
                    </div>
                    {skill.description && (
                      <p className="text-[11px] text-slate-400 leading-snug">{skill.description}</p>
                    )}
                    {skill.examples && skill.examples.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {skill.examples.slice(0, 2).map((ex, i) => (
                          <li key={i} className="text-[10px] text-slate-500 italic">
                            &ldquo;{ex}&rdquo;
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fallback skill tags when full skills haven't loaded yet */}
          {isAgent &&
            fullSkills.length === 0 &&
            agentSkills &&
            agentSkills.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {agentSkills.map((skill) => (
                  <span
                    key={skill}
                    className="text-[10px] px-1.5 py-0.5 bg-white/10 text-slate-300 rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

          {/* Active channels */}
          {isAgent && channels && channels.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Active in {channels.length} channel{channels.length === 1 ? '' : 's'}
              </p>
              <div className="space-y-1">
                {channels.slice(0, 6).map((ch) => {
                  const lvl = ch.engagementLevel ?? 1;
                  return (
                    <button
                      key={ch.channelId}
                      onClick={() => {
                        setOpen(false);
                        router.push(`/workspace/channel/${encodeURIComponent(ch.channelName)}`);
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-left"
                    >
                      {ch.isPrivate ? (
                        <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                      ) : (
                        <Hash className="w-3 h-3 text-slate-500 shrink-0" />
                      )}
                      <span className="text-xs text-slate-300 truncate flex-1">
                        {ch.channelName}
                      </span>
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-full shrink-0',
                          ENGAGEMENT_COLORS[lvl] ?? ENGAGEMENT_COLORS[1]
                        )}
                      >
                        {ENGAGEMENT_LABELS[lvl] ?? 'Reactive'}
                      </span>
                    </button>
                  );
                })}
                {channels.length > 6 && (
                  <p className="text-[10px] text-slate-500 px-2">
                    +{channels.length - 6} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Agent actions */}
          {isAgent && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
              <Button
                size="sm"
                onClick={handleSendMessage}
                className="w-full h-8 bg-[#36c5f0]/20 hover:bg-[#36c5f0]/30 text-[#36c5f0] text-xs gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Message
              </Button>
              {agent?.viewerPermission === 'owner' ||
              agent?.viewerPermission === 'workspace_admin' ? (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOpen(false);
                      router.push('/workspace/settings/agents');
                    }}
                    className="flex-1 h-7 text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDeleteAgent}
                    className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* Human actions */}
          {!isAgent && (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={handleSendMessage}
                className="w-full h-8 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Send message
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleToggleBlock}
                disabled={isBlockLoading}
                className={cn(
                  'w-full h-8 text-xs gap-1.5',
                  isBlocked
                    ? 'text-green-400 hover:text-green-300 hover:bg-green-400/10'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
                )}
              >
                {isBlocked ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    Unblock user
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    Block user
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
