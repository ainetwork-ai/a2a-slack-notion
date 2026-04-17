'use client';

import { useState } from 'react';
import { AlignLeft } from 'lucide-react';
import { PageOutlineSheet } from './PageOutlineSheet';

interface PageOutlineButtonProps {
  pageId: string;
  onJumpTo?: (blockId: string) => void;
}

/**
 * PageOutlineButton — drop-in trigger that opens the outline sheet on click.
 * Place in a toolbar or header wherever a TOC toggle is needed.
 */
export function PageOutlineButton({ pageId, onJumpTo }: PageOutlineButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Page outline"
        aria-label="Open page outline"
        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
      >
        <AlignLeft className="w-4 h-4" />
      </button>
      <PageOutlineSheet
        pageId={pageId}
        open={open}
        onOpenChange={setOpen}
        onJumpTo={onJumpTo}
      />
    </>
  );
}
