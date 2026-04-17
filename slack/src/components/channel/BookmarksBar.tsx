'use client';

import { useState } from 'react';
import { Plus, ExternalLink, Pencil, Trash2, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';

interface Bookmark {
  id: string;
  title: string;
  url: string;
  emoji: string;
  position: number;
  createdBy: string;
}

const fetcher = (u: string) => fetch(u).then(r => r.json());

const EMOJI_CHOICES = ['🔖', '📌', '🔗', '📄', '📊', '📈', '🎨', '🚀', '⭐', '🔥', '💡', '📝', '🎯', '🗂️', '📚'];

export default function BookmarksBar({ channelId, canEdit = true }: { channelId: string; canEdit?: boolean }) {
  const { data, mutate } = useSWR<{ bookmarks: Bookmark[] }>(
    channelId ? `/api/channels/${channelId}/bookmarks` : null,
    fetcher
  );
  const bookmarks = data?.bookmarks ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  if (!channelId) return null;
  if (bookmarks.length === 0 && !canEdit) return null;

  return (
    <div className="flex items-center gap-1 px-3 h-9 border-b border-white/5 bg-[#1a1d21] overflow-x-auto shrink-0">
      {bookmarks.map(b => (
        <BookmarkChip
          key={b.id}
          bookmark={b}
          channelId={channelId}
          canEdit={canEdit}
          isEditing={editId === b.id}
          onOpenEdit={() => setEditId(b.id)}
          onCloseEdit={() => setEditId(null)}
          onChanged={() => mutate()}
        />
      ))}
      {canEdit && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger
            title="Add bookmark"
            className="inline-flex items-center gap-1 px-2 h-7 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {bookmarks.length === 0 && <span>Add bookmark</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 bg-[#222529] border-white/10 text-white p-0">
            <BookmarkForm
              channelId={channelId}
              onDone={() => {
                setAddOpen(false);
                mutate();
              }}
              onCancel={() => setAddOpen(false)}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function BookmarkChip({
  bookmark,
  channelId,
  canEdit,
  isEditing,
  onOpenEdit,
  onCloseEdit,
  onChanged,
}: {
  bookmark: Bookmark;
  channelId: string;
  canEdit: boolean;
  isEditing: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onChanged: () => void;
}) {
  async function handleDelete() {
    if (!window.confirm(`Remove "${bookmark.title}" from bookmarks?`)) return;
    await fetch(`/api/channels/${channelId}/bookmarks?id=${bookmark.id}`, { method: 'DELETE' });
    onChanged();
    onCloseEdit();
  }

  return (
    <Popover open={isEditing} onOpenChange={(v) => (v ? onOpenEdit() : onCloseEdit())}>
      <div className="flex items-center group shrink-0">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2 h-7 rounded-l text-slate-300 hover:text-white hover:bg-white/10 transition-colors text-xs"
          title={bookmark.url}
        >
          <span className="text-sm leading-none">{bookmark.emoji}</span>
          <span className="truncate max-w-[160px]">{bookmark.title}</span>
          <ExternalLink className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
        {canEdit && (
          <PopoverTrigger
            title="Edit bookmark"
            className="inline-flex items-center justify-center w-6 h-7 rounded-r text-slate-500 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil className="w-3 h-3" />
          </PopoverTrigger>
        )}
      </div>
      <PopoverContent align="start" className="w-72 bg-[#222529] border-white/10 text-white p-0">
        <BookmarkForm
          channelId={channelId}
          initial={bookmark}
          onDone={() => {
            onChanged();
            onCloseEdit();
          }}
          onCancel={onCloseEdit}
          onDelete={handleDelete}
        />
      </PopoverContent>
    </Popover>
  );
}

function BookmarkForm({
  channelId,
  initial,
  onDone,
  onCancel,
  onDelete,
}: {
  channelId: string;
  initial?: Bookmark;
  onDone: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🔖');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!title.trim() || !url.trim()) {
      setError('Title and URL are required');
      return;
    }
    setSaving(true);
    try {
      const res = initial
        ? await fetch(`/api/channels/${channelId}/bookmarks`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: initial.id, title, url, emoji }),
          })
        : await fetch(`/api/channels/${channelId}/bookmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, url, emoji }),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to save');
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{initial ? 'Edit bookmark' : 'Add bookmark'}</p>
        <button onClick={onCancel} className="text-slate-500 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-start gap-2">
        <Popover>
          <PopoverTrigger className="w-9 h-9 flex items-center justify-center rounded border border-white/10 bg-white/5 hover:bg-white/10 text-lg shrink-0">
            {emoji}
          </PopoverTrigger>
          <PopoverContent className="w-56 bg-[#222529] border-white/10 p-2">
            <div className="grid grid-cols-5 gap-1">
              {EMOJI_CHOICES.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-base ${
                    emoji === e ? 'bg-white/10 ring-1 ring-white/20' : ''
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex-1 space-y-1.5">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
          />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center justify-between pt-1">
        {onDelete ? (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-7 text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-7 text-xs bg-[#007a5a] hover:bg-[#148567] text-white"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
