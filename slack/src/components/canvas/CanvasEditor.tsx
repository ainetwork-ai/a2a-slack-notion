'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Eye, Edit3, Loader2, FileText, ChevronLeft, Plus, Trash2, Search } from 'lucide-react';
import { useToast } from '@/components/ui/toast-provider';
import { CanvasMarkdown } from '@/lib/canvas/CanvasMarkdown';
import NotionCanvasFrame from '@/components/canvas/NotionCanvasFrame';

type PipelineStatus = 'draft' | 'edited' | 'fact-checked' | 'published' | null;

interface CanvasSummary {
  id: string;
  title: string;
  topic: string | null;
  pipelineStatus: PipelineStatus;
  pipelineRunId: string | null;
  updatedAt: string;
  createdAt: string;
  updatedByName: string | null;
  pageId?: string | null;
}

interface Canvas extends CanvasSummary {
  content: string;
  updatedByUser?: { id: string; displayName: string } | null;
}

interface CanvasEditorProps {
  channelId: string;
  onClose: () => void;
}

// ── Pipeline status stepper ───────────────────────────────────────────────────

const PIPELINE_STAGES: { key: NonNullable<PipelineStatus>; label: string }[] = [
  { key: 'draft',        label: 'Draft' },
  { key: 'edited',       label: 'Edited' },
  { key: 'fact-checked', label: 'Checked' },
  { key: 'published',    label: 'Published' },
];

const STATUS_COLORS: Record<NonNullable<PipelineStatus>, string> = {
  draft:        'bg-blue-500',
  edited:       'bg-yellow-500',
  'fact-checked': 'bg-orange-400',
  published:    'bg-green-500',
};

const STATUS_LABELS: Record<NonNullable<PipelineStatus>, string> = {
  draft:        'Drafting',
  edited:       'Editing',
  'fact-checked': 'Fact-checked',
  published:    'Published ✅',
};

// ── Pipeline stepper (subtask #4: interactive) ────────────────────────────────

interface PipelineStepperProps {
  status: PipelineStatus;
  canEdit: boolean;
  onPickStatus: (next: NonNullable<PipelineStatus>) => void;
}

function PipelineStepper({ status, canEdit, onPickStatus }: PipelineStepperProps) {
  if (!status) return null;
  const currentIdx = PIPELINE_STAGES.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-1 px-3.5 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0">
      {PIPELINE_STAGES.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const dotClasses = `w-2.5 h-2.5 rounded-full ${
          done    ? 'bg-green-500' :
          active  ? STATUS_COLORS[status] + ' ring-2 ring-white/20' :
                    'bg-white/20'
        }`;
        const clickable = canEdit && !active;
        return (
          <div key={stage.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center flex-1">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onPickStatus(stage.key)}
                  className={`${dotClasses} cursor-pointer hover:scale-110 transition-transform`}
                  title={`Move status to ${stage.label}`}
                />
              ) : (
                <div className={dotClasses} />
              )}
              <span className={`text-[11px] mt-1 font-medium ${
                done ? 'text-green-400' : active ? 'text-white' : 'text-slate-600'
              }`}>
                {stage.label}
              </span>
            </div>
            {idx < PIPELINE_STAGES.length - 1 && (
              <div className={`h-px flex-1 mb-4 ${done ? 'bg-green-500/50' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Canvas list item ──────────────────────────────────────────────────────────

function CanvasListItem({ canvas, onSelect, chained }: { canvas: CanvasSummary; onSelect: () => void; chained?: boolean }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3.5 py-3 hover:bg-white/5 transition-colors border-b border-white/5 group ${chained ? 'pl-8' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-white font-medium truncate">{canvas.title}</p>
          {canvas.topic && canvas.topic !== canvas.title && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{canvas.topic}</p>
          )}
        </div>
        {/* Pipeline status badge hidden — articles are tracked by canvas list */}
      </div>
      <p className="text-xs text-slate-600 mt-1.5">
        {formatRelativeTime(canvas.updatedAt)}
        {canvas.updatedByName ? ` · ${canvas.updatedByName}` : ''}
      </p>
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PANEL_WIDTH_KEY = 'canvasPanelWidth';
const DEFAULT_PANEL_WIDTH = 384; // w-96
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;

// Subtask #7: tuned auto-save constants
const SAVE_DEBOUNCE_MS = 800;
const FRESH_CANVAS_WINDOW_MS = 15_000; // within 15 s of creation, first save is immediate

// Narrow typeguard for list-endpoint response. The server returns either a raw
// array (legacy) or {canvases, nextCursor} (current). Support both.
function parseCanvasList(data: unknown): { canvases: CanvasSummary[]; nextCursor?: string } {
  if (Array.isArray(data)) return { canvases: data as CanvasSummary[] };
  if (data && typeof data === 'object' && 'canvases' in data) {
    const d = data as { canvases: CanvasSummary[]; nextCursor?: string };
    return { canvases: Array.isArray(d.canvases) ? d.canvases : [], nextCursor: d.nextCursor };
  }
  return { canvases: [] };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CanvasEditor({ channelId, onClose }: CanvasEditorProps) {
  const { showToast } = useToast();
  const [canvasList, setCanvasList] = useState<CanvasSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  // Timestamp of last successful save — used to show "Saved ✓" for 2 seconds
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Subtask #6: conflict banner state — populated when server returns 409
  const [conflict, setConflict] = useState<Canvas | null>(null);
  // Subtask #4: interactive pipeline state
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [myChannelRole, setMyChannelRole] = useState<string | null>(null);
  // Fix #6: resizable panel — load persisted width or fall back to w-96
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTH;
    const stored = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? '', 10);
    return isNaN(stored) ? DEFAULT_PANEL_WIDTH : Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, stored));
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  // Subtask #7: track in-flight save so we don't clear dirty state on a racy failure
  const saveInFlightRef = useRef(false);
  // Subtask #6: baseUpdatedAt used for If-Unmodified-Since on the next save
  const baseUpdatedAtRef = useRef<string | null>(null);
  // Subtask #7: when true, the next scheduleSave fires immediately (no debounce)
  const fireImmediateRef = useRef(false);
  // Fix #11: prevent auto-open from re-firing after backToList() refetches the list
  const hasAutoOpenedRef = useRef(false);
  // Fix #6: track drag state for resize handle
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(DEFAULT_PANEL_WIDTH);

  // Subtask #5: debounce search query (250 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Subtask #5: Load list of canvases; auto-open sole canvas only on first mount ──
  const loadList = useCallback((opts?: { autoOpen?: boolean; q?: string; cursor?: string; append?: boolean }) => {
    const autoOpen = opts?.autoOpen ?? false;
    const q = opts?.q ?? '';
    const cursor = opts?.cursor;
    const append = opts?.append ?? false;

    if (!channelId) {
      console.error('canvas: channelId missing, skipping fetch');
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (append) setLoadingMore(true); else setLoading(true);

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    const url = `/api/channels/${channelId}/canvases${qs ? '?' + qs : ''}`;

    fetch(url)
      .then(r => r.json())
      .then((data: unknown) => {
        const { canvases: list, nextCursor: nc } = parseCanvasList(data);
        setNextCursor(nc);
        setCanvasList(prev => append ? [...prev, ...list] : list);
        // Only auto-open on the very first fetch, not on subsequent refreshes
        if (autoOpen && !hasAutoOpenedRef.current && list.length === 1 && !cursor) {
          hasAutoOpenedRef.current = true;
          openCanvas(list[0].id);
        }
      })
      .catch(() => {
        if (!append) setCanvasList([]);
        showToast('Failed to load canvases', 'error');
      })
      .finally(() => {
        if (append) setLoadingMore(false); else setLoading(false);
      });
  // openCanvas is stable after mount; eslint-disable is correct here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, showToast]);

  // First mount: load with autoOpen
  useEffect(() => {
    loadList({ autoOpen: true });
  // loadList identity changes only when channelId/showToast change
  }, [loadList]);

  // Subtask #5: reload when search query changes
  useEffect(() => {
    // Skip when viewing a specific canvas
    if (canvas) return;
    loadList({ q: debouncedQuery });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Subtask #4: resolve current user's channel role so we can show/hide
  // interactive pipeline dots. Server remains the source of truth — this is
  // just a UI hint so guests see non-clickable dots instead of a mystery 403.
  useEffect(() => {
    if (!channelId) {
      console.error('canvas: channelId missing, skipping fetch');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [meRes, chanRes] = await Promise.all([
          fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
          fetch(`/api/channels/${channelId}`).then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        const myId: string | undefined = meRes?.user?.id;
        interface Member { id: string; role: string }
        const members: Member[] = Array.isArray(chanRes?.members) ? chanRes.members : [];
        const me = myId ? members.find(m => m.id === myId) : null;
        setMyChannelRole(me?.role ?? 'member');
      } catch {
        // Silent: server enforces permissions. Default to 'member' so UX
        // doesn't silently hide buttons for legitimate users.
        if (!cancelled) setMyChannelRole('member');
      }
    })();
    return () => { cancelled = true; };
  }, [channelId]);

  // Listen for open-canvas events from channel messages (canvas link clicks)
  useEffect(() => {
    function handleOpenCanvas(e: Event) {
      const detail = (e as CustomEvent).detail as { canvasId?: string };
      if (detail?.canvasId) openCanvas(detail.canvasId);
    }
    window.addEventListener('open-canvas', handleOpenCanvas);
    return () => window.removeEventListener('open-canvas', handleOpenCanvas);
  });

  function openCanvas(canvasId: string) {
    setLoading(true);
    fetch(`/api/canvases/${canvasId}`)
      .then(r => r.json())
      .then((data: Canvas) => {
        setCanvas(data);
        setTitle(data.title);
        setTopic(data.topic ?? '');
        setContent(data.content);
        setSaveError(false);
        setLastSavedAt(null);
        setConflict(null);
        baseUpdatedAtRef.current = data.updatedAt ?? null;
      })
      .catch(() => {
        showToast('Failed to open canvas', 'error');
      })
      .finally(() => setLoading(false));
  }

  function backToList() {
    // Flush any pending save synchronously before leaving detail view
    if (isDirtyRef.current && canvas) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save(title, content, topic);
    }
    setCanvas(null);
    setMode('edit');
    setConfirmDelete(false);
    setConflict(null);
    // Refresh list (autoOpen=false so we don't re-trigger single-canvas auto-open)
    loadList({ q: debouncedQuery });
  }

  // ── Fix #5: show "Saved ✓" label for 2 s after a successful save ─────────────
  function markSaved() {
    isDirtyRef.current = false;
    setSaveError(false);
    setLastSavedAt(Date.now());
    if (savedLabelTimerRef.current) clearTimeout(savedLabelTimerRef.current);
    savedLabelTimerRef.current = setTimeout(() => setLastSavedAt(null), 2000);
  }

  const save = useCallback(
    async (titleVal: string, contentVal: string, topicVal: string, opts?: { overwrite?: boolean }) => {
      if (!canvas) return;
      if (saveInFlightRef.current) return; // avoid concurrent PATCHes
      saveInFlightRef.current = true;
      setSaving(true);
      try {
        const res = await fetch(`/api/canvases/${canvas.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(baseUpdatedAtRef.current ? { 'If-Unmodified-Since': baseUpdatedAtRef.current } : {}),
          },
          body: JSON.stringify({
            title: titleVal,
            content: contentVal,
            topic: topicVal.trim() || null,
            baseUpdatedAt: baseUpdatedAtRef.current,
            overwrite: opts?.overwrite ?? false,
          }),
        });
        if (res.status === 409) {
          // Subtask #6: conflict — surface banner, keep dirty so user can retry
          const body = await res.json().catch(() => ({}));
          const latest: Canvas | undefined = body?.latest;
          if (latest) setConflict(latest);
          isDirtyRef.current = true;
          setSaveError(false);
          return;
        }
        if (!res.ok) throw new Error('Save failed');
        const updated: Canvas = await res.json();
        setCanvas(prev => prev ? { ...prev, ...updated } : updated);
        baseUpdatedAtRef.current = updated.updatedAt ?? baseUpdatedAtRef.current;
        markSaved();
      } catch {
        // Subtask #7: keep dirty so the user can retry; surface the error
        isDirtyRef.current = true;
        setSaveError(true);
      } finally {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    // canvas.id is the meaningful dependency — markSaved is local and stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [canvas]
  );

  // Subtask #7: 800 ms debounce. First save after creation fires immediately.
  function scheduleSave(newTitle: string, newContent: string, newTopic: string) {
    isDirtyRef.current = true;
    setSaveError(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // Treat freshly created canvases (last 15 s, zero successful edits) as
    // needing an immediate save on the very first keystroke.
    const isFresh =
      !!canvas &&
      !lastSavedAt &&
      Date.now() - new Date(canvas.createdAt).getTime() < FRESH_CANVAS_WINDOW_MS;

    if (fireImmediateRef.current || isFresh) {
      fireImmediateRef.current = false;
      save(newTitle, newContent, newTopic);
      return;
    }

    saveTimerRef.current = setTimeout(
      () => save(newTitle, newContent, newTopic),
      SAVE_DEBOUNCE_MS
    );
  }

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedLabelTimerRef.current) clearTimeout(savedLabelTimerRef.current);
  }, []);

  // Subtask #7: onBlur flush — immediately save, cancel any pending debounce.
  function handleBlur() {
    if (isDirtyRef.current && canvas) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save(title, content, topic);
    }
  }

  // ── Fix #3: warn on unload + best-effort beacon save ─────────────────────────
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      // Standard way to trigger the browser's "Leave site?" dialog
      e.returnValue = '';
    }

    function handlePageHide() {
      // Best-effort flush via beacon — works even when the page is being unloaded
      if (!isDirtyRef.current || !canvas) return;
      const blob = new Blob(
        [JSON.stringify({
          title,
          content,
          topic: topic.trim() || null,
          baseUpdatedAt: baseUpdatedAtRef.current,
        })],
        { type: 'application/json' }
      );
      navigator.sendBeacon(`/api/canvases/${canvas.id}`, blob);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [canvas, title, content, topic]);

  // ── Fix #7: keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't swallow shortcuts while the user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 's') {
        // Cmd/Ctrl+S: cancel debounce and save immediately
        e.preventDefault();
        if (canvas && isDirtyRef.current) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          save(title, content, topic);
        }
        return;
      }

      if (isMod && e.key === 'e') {
        // Cmd/Ctrl+E: toggle edit/preview (only in detail view)
        if (canvas) {
          e.preventDefault();
          setMode(m => m === 'edit' ? 'preview' : 'edit');
        }
        return;
      }

      // Esc only when not in a text field so it doesn't break normal typing
      if (e.key === 'Escape' && !inField) {
        if (canvas) {
          backToList();
        } else {
          handleClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // backToList/handleClose capture latest state via refs/closures
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, title, content, topic, save]);

  // ── Fix #3: flush on panel close before calling onClose ──────────────────────
  function handleClose() {
    if (isDirtyRef.current && canvas) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save(title, content, topic);
    }
    onClose();
  }

  async function handleCreateCanvas() {
    if (!channelId) {
      console.error('canvas: channelId missing, skipping fetch');
      showToast('Channel is still loading — try again in a moment.', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        console.error('canvas: create failed', res.status, body);
        const msg = (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string')
          ? (body as { error: string }).error
          : `Failed to create canvas (status ${res.status})`;
        showToast(msg, 'error');
        return;
      }
      const created: Canvas = await res.json();
      setCanvasList(prev => [created, ...prev]);
      setCanvas(created);
      setTitle(created.title);
      setTopic(created.topic ?? '');
      setContent(created.content ?? '');
      setSaveError(false);
      setLastSavedAt(null);
      setConflict(null);
      baseUpdatedAtRef.current = created.updatedAt ?? null;
      // Subtask #7: next keystroke saves immediately
      fireImmediateRef.current = true;
    } catch (e) {
      console.error('canvas: create threw', e);
      showToast('Failed to create canvas', 'error');
    } finally {
      setCreating(false);
    }
  }

  // ── Fix #4: delete canvas ─────────────────────────────────────────────────────
  async function handleDeleteCanvas() {
    if (!canvas) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/canvases/${canvas.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      // Remove from list and navigate back
      setCanvasList(prev => prev.filter(c => c.id !== canvas.id));
      isDirtyRef.current = false;
      setCanvas(null);
      setMode('edit');
      setConfirmDelete(false);
      showToast('Canvas deleted', 'success');
    } catch {
      showToast('Failed to delete canvas', 'error');
    } finally {
      setDeleting(false);
    }
  }

  // ── Subtask #4: pick a new pipeline status ────────────────────────────────────
  async function handlePickStatus(next: NonNullable<PipelineStatus>) {
    if (!canvas) return;
    const stageLabel = PIPELINE_STAGES.find(s => s.key === next)?.label ?? next;
    if (!window.confirm(`Move status to ${stageLabel}?`)) return;

    // Optimistic update
    const prevStatus = canvas.pipelineStatus;
    setCanvas(c => c ? { ...c, pipelineStatus: next } : c);
    setCanvasList(list => list.map(c => c.id === canvas.id ? { ...c, pipelineStatus: next } : c));
    setPipelineBusy(true);
    try {
      const res = await fetch(`/api/canvases/${canvas.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Status update failed');
      }
      showToast(`Status moved to ${stageLabel}`, 'success');
    } catch (e) {
      // Revert on failure
      setCanvas(c => c ? { ...c, pipelineStatus: prevStatus } : c);
      setCanvasList(list => list.map(c => c.id === canvas.id ? { ...c, pipelineStatus: prevStatus } : c));
      const msg = e instanceof Error ? e.message : 'Failed to update status';
      showToast(msg, 'error');
    } finally {
      setPipelineBusy(false);
    }
  }

  // ── Subtask #6: conflict banner actions ───────────────────────────────────────
  function handleConflictReload() {
    if (!conflict) return;
    // Adopt the server's canonical state. Keep the user's in-memory text so
    // they can copy it out before overwriting (we don't clobber `content`).
    setCanvas(conflict);
    setTitle(conflict.title);
    setTopic(conflict.topic ?? '');
    // Intentionally do NOT overwrite `content` — user may still want their text.
    // They can manually reconcile.
    baseUpdatedAtRef.current = conflict.updatedAt ?? null;
    setConflict(null);
    setMode('preview'); // show the server's version alongside their edit buffer
    showToast('Loaded latest from server. Your text is preserved — copy it before overwriting.', 'info');
  }

  async function handleConflictOverwrite() {
    if (!conflict || !canvas) return;
    // Force-save with current in-memory text, skipping the base check.
    baseUpdatedAtRef.current = conflict.updatedAt ?? baseUpdatedAtRef.current;
    setConflict(null);
    await save(title, content, topic, { overwrite: true });
  }

  // ── Fix #6: drag-to-resize left edge ─────────────────────────────────────────
  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = panelWidth;

    function onMouseMove(me: MouseEvent) {
      // Dragging left edge: moving left increases width, moving right decreases it
      const delta = dragStartXRef.current - me.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, dragStartWidthRef.current + delta));
      setPanelWidth(newWidth);
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      // Persist so width survives navigation
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Persist width whenever it settles (mouseup fires after state update on next render)
  useEffect(() => {
    localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
  }, [panelWidth]);

  // Can the current user interact with the pipeline stepper? (#4)
  const canEditPipeline = useMemo(() => {
    // Client-side hint only — server is the final authority.
    // Non-guest members + admins can move status.
    return myChannelRole !== null && myChannelRole !== 'guest';
  }, [myChannelRole]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full border-l border-white/10 bg-[#1a1d21] relative"
      style={{ width: panelWidth }}
    >
      {/* Fix #6: left-edge resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-white/10 z-10 transition-colors"
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 h-12 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {canvas && (
            <button
              onClick={backToList}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
              title="Back to canvas list"
            >
              <ChevronLeft className="w-[18px] h-[18px]" />
            </button>
          )}
          <FileText className="w-[18px] h-[18px] text-slate-400 shrink-0" />
          <span className="text-[15px] font-semibold text-white truncate">
            {canvas ? canvas.title : 'Canvas'}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canvas && (
            <>
              <button
                onClick={() => setMode('edit')}
                title="Edit (Cmd+E)"
                className={`p-1.5 rounded transition-colors ${mode === 'edit' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMode('preview')}
                title="Preview (Cmd+E)"
                className={`p-1.5 rounded transition-colors ${mode === 'preview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Eye className="w-4 h-4" />
              </button>
              {/* Fix #4: delete button with confirm step */}
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDeleteCanvas}
                    disabled={deleting}
                    className="text-[11px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[11px] px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Delete canvas"
                  className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : canvas ? (
          // ── Detail view ─────────────────────────────────────────────────────
          <>
            {/* Related canvases from same pipeline run */}
            {canvas.pipelineRunId && (() => {
              const siblings = canvasList.filter(c => c.pipelineRunId === canvas.pipelineRunId);
              if (siblings.length <= 1) return null;
              return (
                <div className="px-3.5 py-2 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto shrink-0">
                  {siblings.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((s, i) => (
                    <div key={s.id} className="flex items-center gap-1.5 shrink-0">
                      {i > 0 && <span className="text-[#1d9bd1]/50">→</span>}
                      <button
                        onClick={() => openCanvas(s.id)}
                        className={`text-xs px-2 py-1 rounded ${
                          s.id === canvas.id
                            ? 'bg-[#1d9bd1]/20 text-[#1d9bd1] font-medium'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        } transition-colors`}
                      >
                        {s.title}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Subtask #6: conflict banner — non-dismissible */}
            {conflict && (
              <div className="px-3.5 py-2.5 bg-red-500/10 border-b border-red-500/30 shrink-0">
                <p className="text-[13px] text-red-200 mb-2">
                  Someone else just edited this canvas{conflict.updatedByUser?.displayName ? ` (${conflict.updatedByUser.displayName})` : ''}.
                  Your text has not been saved.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConflictReload}
                    className="text-[12px] px-2 py-1 rounded bg-white/10 text-white hover:bg-white/15 transition-colors"
                  >
                    Reload (keep my text)
                  </button>
                  <button
                    onClick={handleConflictOverwrite}
                    className="text-[12px] px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500 transition-colors"
                  >
                    Overwrite
                  </button>
                </div>
              </div>
            )}

            {/* Title — Fix #9: red border when empty */}
            <div className="px-3.5 pt-3.5 pb-1 shrink-0">
              {mode === 'edit' ? (
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); scheduleSave(e.target.value, content, topic); }}
                  onBlur={handleBlur}
                  className={`w-full bg-transparent text-white font-bold text-[17px] focus:outline-none border-b pb-0.5 placeholder-slate-600 ${
                    title.trim() === '' ? 'border-red-500/60' : 'border-transparent focus:border-white/20'
                  }`}
                  placeholder="Canvas title"
                />
              ) : (
                <h2 className="text-white font-bold text-[17px]">{title || 'Untitled'}</h2>
              )}
            </div>

            {/* Topic field hidden — workflow canvases get topic from pipeline */}

            {/* Fix #5: "Saved ✓" / "Saving…" / "Last edited" status line */}
            <div className="px-3.5 pb-2 shrink-0">
              <span className="text-xs text-slate-600">
                {saving ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                  </span>
                ) : saveError ? (
                  <span className="flex items-center gap-1 text-red-400">
                    Save failed —{' '}
                    <button
                      onClick={() => { setSaveError(false); save(title, content, topic); }}
                      className="underline hover:no-underline"
                    >
                      retry
                    </button>
                  </span>
                ) : lastSavedAt ? (
                  <span className="text-green-400">Saved ✓</span>
                ) : canvas.updatedAt ? (
                  `Last edited ${canvas.updatedByUser?.displayName ? `by ${canvas.updatedByUser.displayName}, ` : ''}${formatRelativeTime(canvas.updatedAt)}`
                ) : null}
              </span>
            </div>

            {/* Content */}
            {canvas.pageId ? (
              // Notion block-tree editor rendered inside a persistent same-origin iframe.
              // View Transitions morph via `notion-frame-${pageId}` name.
              <div className="flex-1 min-h-0 overflow-hidden">
                <NotionCanvasFrame pageId={canvas.pageId} mode="panel" />
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-3.5 pb-3.5">
                {mode === 'edit' ? (
                  <textarea
                    value={content}
                    onChange={e => { setContent(e.target.value); scheduleSave(title, e.target.value, topic); }}
                    onBlur={handleBlur}
                    className="w-full h-full min-h-[200px] bg-white/5 border border-white/10 rounded p-2.5 text-[15px] text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-white/20 resize-none placeholder-slate-600"
                    placeholder="Write markdown here…"
                  />
                ) : (
                  <div className="prose prose-invert prose-base max-w-none text-slate-200 text-[15px] leading-relaxed">
                    <CanvasMarkdown content={content || '_No content yet._'} />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // ── List view ────────────────────────────────────────────────────────
          <>
            {/* Fix #10: New canvas button — visibly disabled during creation with inline spinner */}
            <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
              <button
                onClick={handleCreateCanvas}
                disabled={creating}
                className="flex items-center gap-2 w-full px-3 py-2 text-[15px] text-slate-300 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                  : <><Plus className="w-4 h-4" /> New canvas</>
                }
              </button>
            </div>

            {/* Subtask #5: search box */}
            <div className="px-3 py-2 border-b border-white/10 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search canvases…"
                  className="w-full bg-white/5 border border-white/10 rounded pl-8 pr-2 py-1.5 text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            {/* Canvas list */}
            {canvasList.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center">
                <FileText className="w-12 h-12 text-slate-600" />
                {debouncedQuery ? (
                  <p className="text-[15px] text-slate-400">No canvases match &ldquo;{debouncedQuery}&rdquo;.</p>
                ) : (
                  <>
                    <p className="text-[15px] text-slate-400">No canvases yet.</p>
                    <p className="text-sm text-slate-600">Agents will create canvases as they work,<br/>or create one manually above.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  // Group canvases: show a pipeline chain connector for canvases
                  // that share the same pipelineRunId
                  let lastRunId: string | null = null;
                  return canvasList.map((c, idx) => {
                    const sameRun = c.pipelineRunId && c.pipelineRunId === lastRunId;
                    const nextSameRun = c.pipelineRunId && idx < canvasList.length - 1 && canvasList[idx + 1]?.pipelineRunId === c.pipelineRunId;
                    lastRunId = c.pipelineRunId;
                    return (
                      <div key={c.id} className="relative">
                        {/* Chain connector line */}
                        {sameRun && (
                          <div className="absolute left-5 -top-0 w-px h-3 bg-[#1d9bd1]/40" />
                        )}
                        {nextSameRun && (
                          <div className="absolute left-5 -bottom-0 w-px h-3 bg-[#1d9bd1]/40" />
                        )}
                        {sameRun && (
                          <div className="absolute left-[17px] top-[11px] w-2 h-2 rounded-full border border-[#1d9bd1]/60 bg-[#1a1d21]" />
                        )}
                        <CanvasListItem canvas={c} onSelect={() => openCanvas(c.id)} chained={!!sameRun} />
                      </div>
                    );
                  });
                })()}
                {/* Subtask #5: load-more button */}
                {nextCursor && (
                  <div className="px-3 py-2 border-t border-white/5">
                    <button
                      onClick={() => loadList({ q: debouncedQuery, cursor: nextCursor, append: true })}
                      disabled={loadingMore}
                      className="w-full text-center text-[13px] text-slate-400 hover:text-white py-2 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <span className="flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>
                      ) : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
