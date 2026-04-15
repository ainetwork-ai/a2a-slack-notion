'use client';

import { TypingUser } from '@/lib/realtime/use-typing';

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export default function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  let label: string;
  if (typingUsers.length === 1) {
    label = `${typingUsers[0].displayName} is typing`;
  } else if (typingUsers.length === 2) {
    label = `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing`;
  } else if (typingUsers.length === 3) {
    label = `${typingUsers[0].displayName}, ${typingUsers[1].displayName}, and ${typingUsers[2].displayName} are typing`;
  } else {
    const others = typingUsers.length - 2;
    label = `${typingUsers[0].displayName}, ${typingUsers[1].displayName}, and ${others} others are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1 h-6">
      <div className="flex items-center gap-0.5">
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
        <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
      </div>
      <span className="text-xs text-slate-400 italic">{label}...</span>
    </div>
  );
}
