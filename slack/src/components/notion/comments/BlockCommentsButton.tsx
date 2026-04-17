'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import BlockCommentsPanel from './BlockCommentsPanel';
import { useComments } from './use-comments';
import { cn } from '@/lib/utils';

interface BlockCommentsButtonProps {
  blockId: string;
  className?: string;
}

export default function BlockCommentsButton({ blockId, className }: BlockCommentsButtonProps) {
  const [open, setOpen] = useState(false);
  const { comments } = useComments(blockId);
  const unresolvedCount = comments.filter(c => !c.resolved && c.threadId == null).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View comments"
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded',
          'text-slate-400 hover:text-white hover:bg-white/10',
          'text-xs transition-colors',
          className
        )}
        aria-label="Open comments panel"
      >
        <MessageSquare className="w-4 h-4" />
        {unresolvedCount > 0 && (
          <span className="text-[11px] font-medium text-[#e879f9]">{unresolvedCount}</span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[380px] sm:w-[420px] bg-[#1a1d21] border-l border-white/10 p-0 flex flex-col"
        >
          {/* SheetTitle required for accessibility */}
          <SheetTitle className="sr-only">Block comments</SheetTitle>
          <BlockCommentsPanel
            blockId={blockId}
            onClose={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
