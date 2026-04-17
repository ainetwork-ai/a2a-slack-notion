'use client';

import { useState } from 'react';
import { X, History, RotateCcw, Loader2 } from 'lucide-react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Revision {
  id: string;
  editedByName: string;
  editedAt: string;
  contentPreview: string;
}

interface CanvasRevisionsModalProps {
  canvasId: string;
  onClose: () => void;
  onRestored?: () => void;
}

export default function CanvasRevisionsModal({ canvasId, onClose, onRestored }: CanvasRevisionsModalProps) {
  const { data: revisions, isLoading } = useSWR<Revision[]>(
    `/api/canvases/${canvasId}/revisions`,
    fetcher
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(revisionId: string) {
    const confirmed = window.confirm(
      'Restore this version? The current content will be saved as a new revision so you can undo.'
    );
    if (!confirmed) return;

    setRestoringId(revisionId);
    try {
      const res = await fetch(
        `/api/canvases/${canvasId}/revisions/${revisionId}/restore`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? 'Failed to restore revision.');
        return;
      }
      onRestored?.();
      onClose();
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#222529] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400" />
            <h2 className="text-white font-semibold text-base">Revision History</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors rounded p-1 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading revisions…
            </div>
          )}
          {!isLoading && (!revisions || revisions.length === 0) && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-sm gap-2">
              <History className="w-8 h-8 text-slate-600" />
              <p>No revisions yet.</p>
              <p className="text-xs text-slate-600">Revisions are saved automatically when content changes.</p>
            </div>
          )}
          {!isLoading && revisions && revisions.length > 0 && (
            <ul className="divide-y divide-white/5">
              {revisions.map(rev => (
                <li key={rev.id} className="px-5 py-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-400 mb-1">
                        <span className="font-medium text-slate-300">{rev.editedByName}</span>
                        {' · '}
                        {new Date(rev.editedAt).toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {rev.contentPreview ? (
                        <p className="text-xs text-slate-500 line-clamp-2 break-words">
                          {rev.contentPreview}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-600 italic">Empty content</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRestore(rev.id)}
                      disabled={restoringId === rev.id}
                      className="shrink-0 flex items-center gap-1.5 text-xs text-[#1d9bd1] hover:text-white hover:bg-[#1d9bd1]/20 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Restore this version"
                    >
                      {restoringId === rev.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 shrink-0">
          <p className="text-xs text-slate-600">
            Restoring a version saves the current content first, so nothing is permanently lost.
          </p>
        </div>
      </div>
    </div>
  );
}
