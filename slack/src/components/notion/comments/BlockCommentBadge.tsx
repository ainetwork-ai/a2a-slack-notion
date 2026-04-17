'use client';

import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlockCommentBadgeProps {
  blockId: string;
  count?: number;
  onClick?: () => void;
  className?: string;
}

export default function BlockCommentBadge({ blockId, count, onClick, className }: BlockCommentBadgeProps) {
  return (
    <button
      data-block-comment-badge
      data-block-id={blockId}
      onClick={onClick}
      title={count != null ? `${count} comment${count !== 1 ? 's' : ''}` : 'Comments'}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full',
        'bg-[#4a154b]/20 border border-[#4a154b]/40',
        'text-[#e879f9] hover:bg-[#4a154b]/35 hover:border-[#4a154b]/60',
        'transition-colors text-[11px] font-medium leading-none',
        'focus:outline-none focus:ring-1 focus:ring-[#4a154b]/60',
        className
      )}
      aria-label={`${count ?? 0} comment${count !== 1 ? 's' : ''} on block`}
    >
      <MessageSquare className="w-3 h-3 shrink-0" />
      {count != null && count > 0 && <span>{count}</span>}
    </button>
  );
}
