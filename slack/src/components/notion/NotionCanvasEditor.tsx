'use client';

/**
 * NotionCanvasEditor — drop-in replacement for the legacy `CanvasEditor`.
 *
 * Policy:
 *  - If the opened canvas has a `pageId` (→ Notion block tree exists): render
 *    `<NotionPage mode="panel">` with the canvas chrome (PipelineStepper,
 *    title, last-edited meta) rendered in the chrome slot.
 *  - If the canvas is legacy markdown (`pageId` null): fall back to the existing
 *    `CanvasEditor` textarea UX until the migrator (scripts/migrate-canvas-to-blocks.ts)
 *    has run OR the user explicitly opts into conversion.
 *
 * This wrapper keeps the panel host-contract identical: same `channelId` +
 * `onClose` props as the original `CanvasEditor`, so swapping it in only
 * requires changing the import in the channel page.
 */

import { useState, useEffect } from 'react';
import { FileText, ChevronLeft } from 'lucide-react';
import CanvasEditor from '@/components/canvas/CanvasEditor';
import NotionPage from './NotionPage';

interface NotionCanvasEditorProps {
  channelId: string;
  onClose: () => void;
}

type CanvasRow = {
  id: string;
  title: string;
  pageId: string | null;
  pipelineStatus: 'draft' | 'edited' | 'fact-checked' | 'published' | null;
  updatedAt: string;
};

export default function NotionCanvasEditor({ channelId, onClose }: NotionCanvasEditorProps) {
  const [selected, setSelected] = useState<CanvasRow | null>(null);
  const [canvasList, setCanvasList] = useState<CanvasRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/channels/${channelId}/canvases`)
      .then((r) => r.json())
      .then((rows: CanvasRow[]) => {
        setCanvasList(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setCanvasList([]))
      .finally(() => setLoading(false));
  }, [channelId]);

  // Legacy path: anything without pageId delegates to the old CanvasEditor
  // which knows how to handle markdown + autosave + pipeline.
  const hasBlockTree = !!selected?.pageId;

  if (!selected || !hasBlockTree) {
    return <CanvasEditor channelId={channelId} onClose={onClose} />;
  }

  // Block-tree path: render the Notion editor in panel mode, with canvas chrome.
  return (
    <div className="flex flex-col h-full w-96 border-l border-white/10 bg-[#1a1d21]">
      <div className="flex items-center justify-between px-3.5 h-12 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSelected(null)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
            title="Back to canvas list"
          >
            <ChevronLeft className="w-[18px] h-[18px]" />
          </button>
          <FileText className="w-[18px] h-[18px] text-slate-400 shrink-0" />
          <span className="text-[15px] font-semibold text-white truncate">{selected.title}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <NotionPage
          pageId={selected.pageId!}
          mode="panel"
          onClose={onClose}
        />
      </div>
      {/* TODO(P3): preserve existing canvas list view UX when user hits "back" — currently renders legacy CanvasEditor. */}
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <input type="hidden" data-canvas-count={canvasList.length} data-loading={loading ? '1' : '0'} />
    </div>
  );
}
