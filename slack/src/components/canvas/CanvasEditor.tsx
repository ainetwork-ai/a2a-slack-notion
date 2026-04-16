'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Eye, Edit3, Loader2, FileText } from 'lucide-react';
import { renderInlineMarkdown } from '@/components/chat/MessageItem';

interface Canvas {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  updatedByUser?: { id: string; displayName: string } | null;
}

interface CanvasEditorProps {
  channelId: string;
  onClose: () => void;
}

export default function CanvasEditor({ channelId, onClose }: CanvasEditorProps) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/channels/${channelId}/canvas`)
      .then(r => r.json())
      .then((data: Canvas | null) => {
        if (data?.id) {
          setCanvas(data);
          setTitle(data.title);
          setContent(data.content);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

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
      setCanvas(updated);
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
    saveTimerRef.current = setTimeout(() => {
      save(newTitle, newContent);
    }, 2000);
  }

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function handleCreateCanvas() {
    setCreating(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const created: Canvas = await res.json();
      setCanvas(created);
      setTitle(created.title);
      setContent(created.content);
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  function handleBlur() {
    if (isDirtyRef.current && canvas) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save(title, content);
    }
  }

  function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return (
    <div className="flex flex-col h-full w-80 border-l border-white/10 bg-[#1a1d21]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-white">Canvas</span>
        </div>
        <div className="flex items-center gap-1">
          {canvas && (
            <>
              <button
                onClick={() => setMode('edit')}
                title="Edit"
                className={`p-1.5 rounded transition-colors ${mode === 'edit' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMode('preview')}
                title="Preview"
                className={`p-1.5 rounded transition-colors ${mode === 'preview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : !canvas ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center">
            <FileText className="w-10 h-10 text-slate-600" />
            <p className="text-sm text-slate-400">No canvas for this channel yet.</p>
            <button
              onClick={handleCreateCanvas}
              disabled={creating}
              className="px-3 py-1.5 text-sm bg-[#4a154b] hover:bg-[#611f69] text-white rounded transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create canvas'}
            </button>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="px-3 pt-3 pb-1 shrink-0">
              {mode === 'edit' ? (
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); scheduleSave(e.target.value, content); }}
                  onBlur={handleBlur}
                  className="w-full bg-transparent text-white font-bold text-base focus:outline-none border-b border-transparent focus:border-white/20 pb-0.5 placeholder-slate-600"
                  placeholder="Canvas title"
                />
              ) : (
                <h2 className="text-white font-bold text-base">{title || 'Untitled'}</h2>
              )}
            </div>

            {/* Last edited */}
            <div className="px-3 pb-2 shrink-0">
              <span className="text-[11px] text-slate-600">
                {saving ? (
                  <span className="flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…</span>
                ) : canvas.updatedAt ? (
                  `Last edited ${canvas.updatedByUser?.displayName ? `by ${canvas.updatedByUser.displayName}, ` : ''}${formatRelativeTime(canvas.updatedAt)}`
                ) : null}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-3 pb-3">
              {mode === 'edit' ? (
                <textarea
                  value={content}
                  onChange={e => { setContent(e.target.value); scheduleSave(title, e.target.value); }}
                  onBlur={handleBlur}
                  className="w-full h-full min-h-[200px] bg-white/5 border border-white/10 rounded p-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-white/20 resize-none placeholder-slate-600"
                  placeholder="Write markdown here…"
                />
              ) : (
                <div
                  className="prose prose-invert prose-sm max-w-none text-slate-200 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(content || '_No content yet._') }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
