'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize2, Minimize2 } from 'lucide-react';
import {
  bodyTransitionName,
  seamlessNavigate,
  captureScrollRatio,
  restoreScrollRatio,
} from '@/lib/notion/transitions';
import { CollaborativeEditor } from './editor/CollaborativeEditor';

export type NotionPageMode = 'panel' | 'full';

interface NotionPageProps {
  pageId: string;
  mode: NotionPageMode;
  /** Optional workspace id forwarded to the editor (for @mention suggestions). */
  workspaceId?: string;
  /**
   * Optional header chrome (title, pipeline stepper, etc.) rendered above the
   * editor body. Kept OUTSIDE the view-transition body so chrome crossfades
   * independently.
   */
  chrome?: React.ReactNode;
  /** Called when user requests mode swap. Panel → full uses router.push; full → back prefers this, else router.back(). */
  onClose?: () => void;
}

/**
 * Single component rendered in both panel and full-page modes.
 *
 * Invariants:
 *  - Same `pageId` yields the same Tiptap `Editor` across panel ↔ full
 *    (see `editor-pool`).
 *  - `view-transition-name` stays attached to the editor body container so
 *    the View Transitions API treats panel body and full body as the same
 *    element and morphs between them.
 *  - Unmount detaches the ProseMirror DOM from this container but does NOT
 *    destroy the editor.
 */
export default function NotionPage({
  pageId,
  mode,
  workspaceId,
  chrome,
  onClose,
}: NotionPageProps) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  async function expandToFull() {
    const ratio = captureScrollRatio(bodyRef.current);
    sessionStorage.setItem(`notion-scroll-${pageId}`, String(ratio));
    await seamlessNavigate(() => router.push(`/pages/${pageId}`));
  }

  async function collapseToPanel() {
    const ratio = captureScrollRatio(bodyRef.current);
    sessionStorage.setItem(`notion-scroll-${pageId}`, String(ratio));
    await seamlessNavigate(() => {
      if (onClose) onClose();
      else router.back();
    });
  }

  useEffect(() => {
    // Restore scroll ratio after mount in full mode.
    if (mode !== 'full') return;
    const raw = sessionStorage.getItem(`notion-scroll-${pageId}`);
    if (raw == null) return;
    const ratio = Number(raw);
    requestAnimationFrame(() => restoreScrollRatio(bodyRef.current, ratio));
  }, [mode, pageId]);

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1d21]">
      {chrome}
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-white/5 shrink-0">
        {mode === 'panel' ? (
          <button
            onClick={expandToFull}
            title="Expand to full page"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={collapseToPanel}
            title="Collapse to side panel"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div
        ref={bodyRef}
        className="flex-1 overflow-auto"
        style={{ viewTransitionName: bodyTransitionName(pageId) }}
      >
        <div className={mode === 'full' ? 'max-w-[880px] mx-auto px-12 py-10' : 'px-4 py-4'}>
          <CollaborativeEditor
            pageId={pageId}
            {...(workspaceId != null ? { workspaceId } : {})}
          />
        </div>
      </div>
    </div>
  );
}
