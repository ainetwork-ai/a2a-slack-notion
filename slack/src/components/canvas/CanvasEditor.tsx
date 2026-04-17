'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Eye, Edit3, Loader2, FileText, ChevronLeft, Plus } from 'lucide-react';
import { renderInlineMarkdown } from '@/components/chat/MessageItem';

type PipelineStatus = 'draft' | 'edited' | 'fact-checked' | 'published' | null;

interface CanvasSummary {
  id: string;
  title: string;
  topic: string | null;
  pipelineStatus: PipelineStatus;
  updatedAt: string;
  createdAt: string;
  updatedByName: string | null;
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

function PipelineStepper({ status }: { status: PipelineStatus }) {
  if (!status) return null;
  const currentIdx = PIPELINE_STAGES.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-1 px-3.5 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0">
      {PIPELINE_STAGES.map((stage, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={stage.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-2.5 h-2.5 rounded-full ${
                done    ? 'bg-green-500' :
                active  ? STATUS_COLORS[status] + ' ring-2 ring-white/20' :
                          'bg-white/20'
              }`} />
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

function CanvasListItem({ canvas, onSelect }: { canvas: CanvasSummary; onSelect: () => void }) {
  const status = canvas.pipelineStatus;
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-3.5 py-3 hover:bg-white/5 transition-colors border-b border-white/5 group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-white font-medium truncate">{canvas.title}</p>
          {canvas.topic && canvas.topic !== canvas.title && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{canvas.topic}</p>
          )}
        </div>
        {status && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 text-white ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        )}
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

// ── Main component ────────────────────────────────────────────────────────────

export default function CanvasEditor({ channelId, onClose }: CanvasEditorProps) {
  const [canvasList, setCanvasList] = useState<CanvasSummary[]>([]);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // Load list of canvases for this channel
  useEffect(() => {
    setLoading(true);
    fetch(`/api/channels/${channelId}/canvases`)
      .then(r => r.json())
      .then((data: CanvasSummary[]) => {
        setCanvasList(Array.isArray(data) ? data : []);
        // Auto-open the most recent canvas if only one exists
        if (data?.length === 1) openCanvas(data[0].id);
      })
      .catch(() => setCanvasList([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  function openCanvas(canvasId: string) {
    setLoading(true);
    fetch(`/api/canvases/${canvasId}`)
      .then(r => r.json())
      .then((data: Canvas) => {
        setCanvas(data);
        setTitle(data.title);
        setContent(data.content);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function backToList() {
    if (isDirtyRef.current && canvas) {
      save(title, content);
    }
    setCanvas(null);
    setMode('edit');
    // Refresh list
    fetch(`/api/channels/${channelId}/canvases`)
      .then(r => r.json())
      .then((data: CanvasSummary[]) => setCanvasList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  const save = useCallback(async (titleVal: string, contentVal: string) => {
    if (!canvas) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/canvases/${canvas.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleVal, content: contentVal }),
      });
      const updated: Canvas = await res.json();
      setCanvas(prev => prev ? { ...prev, ...updated } : updated);
      isDirtyRef.current = false;
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [canvas]);

  function scheduleSave(newTitle: string, newContent: string) {
    isDirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(newTitle, newContent), 2000);
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  function handleBlur() {
    if (isDirtyRef.current && canvas) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save(title, content);
    }
  }

  async function handleCreateCanvas() {
    setCreating(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const created: Canvas = await res.json();
      setCanvasList(prev => [created, ...prev]);
      setCanvas(created);
      setTitle(created.title);
      setContent(created.content ?? '');
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-96 border-l border-white/10 bg-[#1a1d21]">
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
                title="Edit"
                className={`p-1.5 rounded transition-colors ${mode === 'edit' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMode('preview')}
                title="Preview"
                className={`p-1.5 rounded transition-colors ${mode === 'preview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Eye className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
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
            {/* Pipeline status stepper */}
            <PipelineStepper status={canvas.pipelineStatus} />

            {/* Title */}
            <div className="px-3.5 pt-3.5 pb-1 shrink-0">
              {mode === 'edit' ? (
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); scheduleSave(e.target.value, content); }}
                  onBlur={handleBlur}
                  className="w-full bg-transparent text-white font-bold text-[17px] focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 placeholder-slate-600"
                  placeholder="Canvas title"
                />
              ) : (
                <h2 className="text-white font-bold text-[17px]">{title || 'Untitled'}</h2>
              )}
            </div>

            {/* Last edited */}
            <div className="px-3.5 pb-2 shrink-0">
              <span className="text-xs text-slate-600">
                {saving ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
                ) : canvas.updatedAt ? (
                  `Last edited ${canvas.updatedByUser?.displayName ? `by ${canvas.updatedByUser.displayName}, ` : ''}${formatRelativeTime(canvas.updatedAt)}`
                ) : null}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-3.5 pb-3.5">
              {mode === 'edit' ? (
                <textarea
                  value={content}
                  onChange={e => { setContent(e.target.value); scheduleSave(title, e.target.value); }}
                  onBlur={handleBlur}
                  className="w-full h-full min-h-[200px] bg-white/5 border border-white/10 rounded p-2.5 text-[15px] text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-white/20 resize-none placeholder-slate-600"
                  placeholder="Write markdown here…"
                />
              ) : (
                <div
                  className="prose prose-invert prose-base max-w-none text-slate-200 text-[15px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(content || '_No content yet._') }}
                />
              )}
            </div>
          </>
        ) : (
          // ── List view ────────────────────────────────────────────────────────
          <>
            {/* New canvas button */}
            <div className="px-3 py-2.5 border-b border-white/10 shrink-0">
              <button
                onClick={handleCreateCanvas}
                disabled={creating}
                className="flex items-center gap-2 w-full px-3 py-2 text-[15px] text-slate-300 hover:text-white hover:bg-white/5 rounded transition-colors disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                New canvas
              </button>
            </div>

            {/* Canvas list */}
            {canvasList.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center">
                <FileText className="w-12 h-12 text-slate-600" />
                <p className="text-[15px] text-slate-400">No canvases yet.</p>
                <p className="text-sm text-slate-600">Agents will create canvases as they work,<br/>or create one manually above.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {canvasList.map(c => (
                  <CanvasListItem key={c.id} canvas={c} onSelect={() => openCanvas(c.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
