'use client';

import { useRouter } from 'next/navigation';
import { PenSquare, MessageSquare, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ComposeButtonProps {
  variant?: 'floating' | 'inline';
  className?: string;
}

export default function ComposeButton({ variant = 'inline', className }: ComposeButtonProps) {
  const router = useRouter();

  const trigger =
    variant === 'floating' ? (
      <DropdownMenuTrigger
        aria-label="New message"
        title="New message"
        className={cn(
          'fixed bottom-20 right-6 md:bottom-6 md:right-6 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-[#007a5a] hover:bg-[#148567] text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-white/40',
          className
        )}
      >
        <PenSquare className="w-5 h-5" />
      </DropdownMenuTrigger>
    ) : (
      <DropdownMenuTrigger
        aria-label="New message"
        title="New message"
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded bg-white/5 hover:bg-white/15 text-[#bcabbc] hover:text-white border border-white/10 transition-colors focus:outline-none',
          className
        )}
      >
        <PenSquare className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
    );

  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent
        align={variant === 'floating' ? 'end' : 'start'}
        side={variant === 'floating' ? 'top' : 'bottom'}
        className="w-48 bg-[#222529] border-white/10 text-white"
      >
        <DropdownMenuItem
          onClick={() => router.push('/workspace/dms')}
          className="cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 mr-2 text-slate-400" />
          New message
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push('/workspace/canvases/new')}
          className="cursor-pointer"
        >
          <FileText className="w-4 h-4 mr-2 text-slate-400" />
          New canvas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
