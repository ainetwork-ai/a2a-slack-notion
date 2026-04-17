'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PageOutline } from './PageOutline';

interface PageOutlineSheetProps {
  pageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpTo?: (blockId: string) => void;
}

/**
 * PageOutlineSheet — slide-out panel wrapping PageOutline.
 * Use in panel/tight-space contexts where an inline TOC doesn't fit.
 */
export function PageOutlineSheet({
  pageId,
  open,
  onOpenChange,
  onJumpTo,
}: PageOutlineSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[240px] sm:max-w-[240px] bg-[#1a1d21] border-l border-white/10 flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-4 py-3 border-b border-white/10 shrink-0">
          <SheetTitle className="text-[13px] font-medium text-slate-300">
            On this page
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-1">
          <PageOutline pageId={pageId} onJumpTo={onJumpTo} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
