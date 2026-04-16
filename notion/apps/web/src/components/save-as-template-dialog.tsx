'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface SaveAsTemplateDialogProps {
  workspaceId: string;
  pageTitle: string;
  pageContent: unknown;
  onClose: () => void;
  onSaved?: (templateId: string) => void;
}

const CATEGORIES = [
  { value: 'work', label: 'Work' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'personal', label: 'Personal' },
  { value: 'custom', label: 'Custom' },
];

export function SaveAsTemplateDialog({
  workspaceId,
  pageTitle,
  pageContent,
  onClose,
  onSaved,
}: SaveAsTemplateDialogProps) {
  const [name, setName] = useState(pageTitle || 'Untitled');
  const [category, setCategory] = useState('custom');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    try {
      setSaving(true);
      setError(null);

      // Normalize content to an array of Tiptap nodes
      let content: unknown[] = [];
      if (Array.isArray(pageContent)) {
        content = pageContent;
      } else if (
        pageContent &&
        typeof pageContent === 'object' &&
        'content' in (pageContent as object)
      ) {
        const doc = pageContent as { content?: unknown[] };
        content = doc.content ?? [];
      }

      const result = await apiFetch<{ id: string }>('/api/v1/templates', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          category,
          content,
        }),
      });

      setSaved(true);
      onSaved?.(result.id);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[var(--bg-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-modal)] w-[400px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Save as template</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            <X size={14} className="text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">Template name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[var(--divider)] bg-[var(--bg-default)] text-[var(--text-primary)] outline-none focus:shadow-[0_0_0_2px_var(--accent-blue)] transition"
              placeholder="Template name"
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[var(--divider)] bg-[var(--bg-default)] text-[var(--text-primary)] outline-none focus:shadow-[0_0_0_2px_var(--accent-blue)] transition"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 text-xs text-red-500">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-[var(--accent-blue)] rounded-[var(--radius-sm)] hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saved ? 'Saved!' : 'Save template'}
          </button>
        </div>
      </div>
    </div>
  );
}
