'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Clock, RotateCcw, Save } from 'lucide-react';
import { apiFetch } from '@/lib/notion/api';
import { cn } from '@/lib/utils';

interface Snapshot {
  id: string;
  pageId: string;
  title: string;
  createdBy: string;
  createdAt: string;
}

interface SnapshotListResponse {
  object: string;
  results: Snapshot[];
  next_cursor: string | null;
  has_more: boolean;
}

interface HistoryPanelProps {
  pageId: string;
  onClose: () => void;
  onRestored?: () => void;
}

export function HistoryPanel({ pageId, onClose, onRestored }: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SnapshotListResponse>(
        `/api/v1/pages/${pageId}/history?limit=50`,
      );
      setSnapshots(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadSnapshots().catch(console.error);
  }, [loadSnapshots]);

  async function handleSaveCurrent() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/pages/${pageId}/history`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save version');
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(snapshotId: string) {
    setRestoring(snapshotId);
    setError(null);
    try {
      await apiFetch(`/api/v1/pages/${pageId}/history/${snapshotId}/restore`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadSnapshots();
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
    } finally {
      setRestoring(null);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  function formatFullDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const selectedSnapshot = snapshots.find((s) => s.id === selectedId);

  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-default)] border-l border-[var(--divider)]"
      style={{ width: '280px', minWidth: '240px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-[44px] border-b border-[var(--divider)] shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Clock size={14} className="text-[var(--text-tertiary)]" />
          Page History
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          aria-label="Close history panel"
        >
          <X size={14} className="text-[var(--text-tertiary)]" />
        </button>
      </div>

      {/* Save current version */}
      <div className="px-3 py-2 border-b border-[var(--divider)] shrink-0">
        <button
          onClick={handleSaveCurrent}
          disabled={saving}
          className={cn(
            'flex items-center gap-2 w-full h-[30px] px-2 text-xs rounded-[var(--radius-sm)]',
            'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            'transition-colors duration-[var(--duration-micro)]',
            saving && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Save size={12} />
          {saving ? 'Saving…' : 'Save current version'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 text-xs text-red-600 bg-red-50 rounded-[var(--radius-sm)] shrink-0">
          {error}
        </div>
      )}

      {/* Snapshot list */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--text-tertiary)]">Loading history…</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Clock size={24} className="mx-auto mb-2 text-[var(--text-tertiary)] opacity-40" />
            <p className="text-xs text-[var(--text-tertiary)]">No version history yet.</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 opacity-70">
              Versions are saved automatically every hour.
            </p>
          </div>
        ) : (
          snapshots.map((snap) => (
            <div
              key={snap.id}
              onClick={() => setSelectedId(snap.id === selectedId ? null : snap.id)}
              className={cn(
                'group px-3 py-2 cursor-pointer transition-colors duration-[var(--duration-micro)]',
                snap.id === selectedId
                  ? 'bg-[var(--bg-active)]'
                  : 'hover:bg-[var(--bg-hover)]',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-medium text-[var(--text-primary)] truncate"
                    title={snap.title}
                  >
                    {snap.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5" title={formatFullDate(snap.createdAt)}>
                    {formatDate(snap.createdAt)}
                    {' · '}
                    {snap.createdBy === 'system' ? 'Auto-saved' : 'Manual'}
                  </p>
                </div>
              </div>

              {/* Expanded: restore button */}
              {snap.id === selectedId && (
                <div className="mt-2 pt-2 border-t border-[var(--divider)]">
                  <p className="text-[11px] text-[var(--text-tertiary)] mb-1.5">
                    {formatFullDate(snap.createdAt)}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(snap.id).catch(console.error);
                    }}
                    disabled={restoring === snap.id}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-[var(--radius-sm)]',
                      'bg-[var(--accent-blue)] text-white hover:opacity-90',
                      'transition-opacity duration-[var(--duration-micro)]',
                      restoring === snap.id && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <RotateCcw size={10} />
                    {restoring === snap.id ? 'Restoring…' : 'Restore this version'}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
