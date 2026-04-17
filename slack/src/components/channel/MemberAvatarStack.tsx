'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StackMember {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isAgent?: boolean;
}

export default function MemberAvatarStack({
  members,
  max = 4,
  onClick,
}: {
  members: StackMember[];
  max?: number;
  onClick?: () => void;
}) {
  if (members.length === 0) return null;

  // Prefer humans first, then agents
  const sorted = [...members].sort((a, b) => Number(Boolean(a.isAgent)) - Number(Boolean(b.isAgent)));
  const visible = sorted.slice(0, max);
  const extra = members.length - visible.length;

  return (
    <button
      onClick={onClick}
      title={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
      className="flex items-center -space-x-1.5 px-1 h-8 rounded hover:bg-white/10 transition-colors"
    >
      {visible.map(m => {
        const initials = m.displayName
          .split(' ')
          .map(w => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        return (
          <Avatar
            key={m.id}
            size="sm"
            className="ring-2 ring-[#1a1d21] after:border-0"
          >
            {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
            <AvatarFallback
              className={`text-[10px] ${m.isAgent ? 'bg-[#36c5f0]/30 text-[#36c5f0]' : 'bg-[#4a154b] text-white'}`}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        );
      })}
      {extra > 0 && (
        <span className="relative z-10 inline-flex items-center justify-center size-6 rounded-full bg-white/10 ring-2 ring-[#1a1d21] text-[10px] text-slate-300 font-medium">
          +{extra}
        </span>
      )}
    </button>
  );
}
