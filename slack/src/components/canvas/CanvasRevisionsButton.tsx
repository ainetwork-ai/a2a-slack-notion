'use client';

import { useState } from 'react';
import { History } from 'lucide-react';
import CanvasRevisionsModal from './CanvasRevisionsModal';

interface CanvasRevisionsButtonProps {
  canvasId: string;
  onRestored?: () => void;
  className?: string;
}

/**
 * A standalone button that opens the revision history modal.
 * Intended to be placed in toolbar/header areas adjacent to CanvasEditor
 * without modifying CanvasEditor.tsx itself.
 */
export default function CanvasRevisionsButton({ canvasId, onRestored, className }: CanvasRevisionsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          'flex items-center gap-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 px-2 h-8 rounded transition-colors'
        }
        title="Revision history"
      >
        <History className="w-4 h-4" />
        <span className="hidden sm:inline">History</span>
      </button>

      {open && (
        <CanvasRevisionsModal
          canvasId={canvasId}
          onClose={() => setOpen(false)}
          onRestored={onRestored}
        />
      )}
    </>
  );
}
