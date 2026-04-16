'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Ban, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UserProfilePopupProps {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  statusEmoji?: string;
  statusMessage?: string;
  isAgent?: boolean;
  agentDescription?: string;
  agentSkills?: string[];
  children: React.ReactNode;
}

export default function UserProfilePopup({
  userId,
  displayName,
  avatarUrl,
  statusEmoji,
  statusMessage,
  isAgent,
  agentDescription,
  agentSkills,
  children,
}: UserProfilePopupProps) {
  const router = useRouter();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockLoading, setIsBlockLoading] = useState(false);

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  useEffect(() => {
    if (!userId || isAgent) return;
    fetch('/api/users/block')
      .then(r => r.json())
      .then(data => {
        const blocked: { blockedUserId: string }[] = data.blockedUsers ?? [];
        setIsBlocked(blocked.some(b => b.blockedUserId === userId));
      })
      .catch(() => {});
  }, [userId, isAgent]);

  async function handleSendMessage() {
    try {
      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: userId }),
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
      if (res.ok) {
        setIsBlocked(prev => !prev);
      }
    } catch {
      // silently fail
    } finally {
      setIsBlockLoading(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger render={children as React.ReactElement}>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-[#222529] border-white/10 shadow-xl"
        align="start"
        side="bottom"
      >
        {/* Header banner */}
        <div className={`h-16 ${isAgent ? 'bg-[#36c5f0]/20' : 'bg-[#4a154b]/30'} rounded-t-lg`} />

        <div className="px-4 pb-4">
          {/* Avatar overlapping banner */}
          <div className="-mt-8 mb-3">
            <Avatar className="w-16 h-16 border-4 border-[#222529]">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className={`text-lg font-semibold ${isAgent ? 'bg-[#36c5f0]/20 text-[#36c5f0]' : 'bg-[#4a154b] text-white'}`}>
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name + badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white text-base">{displayName}</span>
            {isAgent && (
              <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30">
                Bot
              </Badge>
            )}
          </div>

          {/* Status */}
          {!isAgent && (statusEmoji || statusMessage) && (
            <div className="flex items-center gap-1.5 text-sm text-slate-300 mb-2">
              {statusEmoji && <span className="text-base leading-none">{statusEmoji}</span>}
              {statusMessage && <span>{statusMessage}</span>}
            </div>
          )}

          {/* Agent description */}
          {isAgent && agentDescription && (
            <p className="text-slate-400 text-xs mb-2 leading-relaxed">{agentDescription}</p>
          )}

          {/* Agent skills */}
          {isAgent && agentSkills && agentSkills.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {agentSkills.map(skill => (
                <span
                  key={skill}
                  className="text-[10px] px-1.5 py-0.5 bg-white/10 text-slate-300 rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Send message button — only for human users */}
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
                className={`w-full h-8 text-xs gap-1.5 ${isBlocked ? 'text-green-400 hover:text-green-300 hover:bg-green-400/10' : 'text-red-400 hover:text-red-300 hover:bg-red-400/10'}`}
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
