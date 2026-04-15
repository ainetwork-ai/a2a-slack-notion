'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { DatabaseTemplate, PropertyDefinition, PropertyValue } from '@notion/shared';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TemplateEditorProps {
  databaseId: string;
  template?: DatabaseTemplate;
  properties: PropertyDefinition[];
  onSave: () => void;
  onClose: () => void;
}

const EMOJI_SUGGESTIONS = ['📄', '📝', '✅', '🎯', '🔖', '💡', '🚀', '⭐', '📋', '🗂️'];

export function TemplateEditor({
  databaseId,
  template,
  properties,
  onSave,
  onClose,
}: TemplateEditorProps) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [icon, setIcon] = useState(template?.icon ?? '');
  const [values, setValues] = useState<Record<string, PropertyValue>>(template?.values ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isEditing = Boolean(template);

  async function handleSave() {
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon || undefined,
        values,
      };
      if (isEditing && template) {
        await apiFetch(`/api/v1/databases/${databaseId}/templates/${template.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/v1/databases/${databaseId}/templates`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  // Only show non-auto, non-title properties for default value configuration
  const editableProperties = properties.filter(
    (p) => p.type !== 'title' &&
      p.type !== 'formula' &&
      p.type !== 'rollup' &&
      p.type !== 'created_time' &&
      p.type !== 'created_by' &&
      p.type !== 'last_edited_time' &&
      p.type !== 'last_edited_by',
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className={cn(
          'bg-[var(--bg-default)] rounded-[6px] w-[520px] max-h-[80vh] flex flex-col',
          'shadow-[0_8px_40px_rgba(15,15,15,0.12),0_0_0_1px_rgba(15,15,15,0.06)]',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {isEditing ? 'Edit template' : 'New template'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[3px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Icon + Name row */}
          <div className="flex items-start gap-2">
            {/* Icon picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                className={cn(
                  'w-9 h-9 rounded-[4px] flex items-center justify-center text-lg',
                  'bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] transition-colors duration-[var(--duration-micro)]',
                )}
                title="Set icon"
              >
                {icon || '📄'}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-10 left-0 z-10 p-2 bg-[var(--bg-default)] rounded-[6px] shadow-[0_4px_16px_rgba(15,15,15,0.12),0_0_0_1px_rgba(15,15,15,0.06)] grid grid-cols-5 gap-1">
                  <button
                    type="button"
                    onClick={() => { setIcon(''); setShowEmojiPicker(false); }}
                    className="px-1 py-0.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] rounded-[3px] col-span-5"
                  >
                    Clear
                  </button>
                  {EMOJI_SUGGESTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { setIcon(emoji); setShowEmojiPicker(false); }}
                      className="w-7 h-7 flex items-center justify-center rounded-[3px] hover:bg-[var(--bg-hover)] text-base"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Name */}
            <div className="flex-1">
              <label className="block text-xs text-[var(--text-tertiary)] mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name..."
                autoFocus
                className={cn(
                  'w-full px-2 py-1.5 text-sm rounded-[3px] bg-[var(--bg-hover)] outline-none',
                  'text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]',
                )}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this template..."
              rows={2}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-[3px] bg-[var(--bg-hover)] outline-none resize-none',
                'text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]',
              )}
            />
          </div>

          {/* Default values */}
          {editableProperties.length > 0 && (
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-2">
                Default property values
              </label>
              <div className="space-y-2">
                {editableProperties.map((prop) => (
                  <DefaultValueRow
                    key={prop.id}
                    property={prop}
                    value={values[prop.id]}
                    onChange={(val) => {
                      if (val === undefined) {
                        const next = { ...values };
                        delete next[prop.id];
                        setValues(next);
                      } else {
                        setValues((prev) => ({ ...prev, [prop.id]: val }));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#eb5757]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--divider)]">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'px-3 py-1.5 text-sm rounded-[3px] text-[var(--text-secondary)]',
              'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { handleSave().catch(console.error); }}
            disabled={saving}
            className={cn(
              'px-3 py-1.5 text-sm rounded-[3px] bg-[var(--accent-blue)] text-white',
              'hover:bg-[var(--accent-blue)]/90 transition-colors duration-[var(--duration-micro)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Inline default-value editor (simplified text/number/checkbox) ----

interface DefaultValueRowProps {
  property: PropertyDefinition;
  value: PropertyValue | undefined;
  onChange: (value: PropertyValue | undefined) => void;
}

function DefaultValueRow({ property, value, onChange }: DefaultValueRowProps) {
  const inputClass = cn(
    'px-2 py-1 text-sm rounded-[3px] bg-[var(--bg-hover)] outline-none flex-1',
    'text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]',
  );

  function renderEditor() {
    switch (property.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone': {
        const strVal = value?.type === property.type ? (value.value as string) : '';
        return (
          <input
            value={strVal}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { onChange(undefined); return; }
              onChange({ type: property.type as 'text', value: v });
            }}
            placeholder={`Default ${property.type}...`}
            className={inputClass}
          />
        );
      }
      case 'number': {
        const numVal = value?.type === 'number' ? (value.value ?? '') : '';
        return (
          <input
            type="number"
            value={numVal === null ? '' : String(numVal)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { onChange(undefined); return; }
              onChange({ type: 'number', value: Number(v) });
            }}
            placeholder="Default number..."
            className={inputClass}
          />
        );
      }
      case 'checkbox': {
        const checked = value?.type === 'checkbox' ? value.value : false;
        return (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange({ type: 'checkbox', value: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent-blue)]"
          />
        );
      }
      case 'select':
      case 'status': {
        const selectedId = value?.type === property.type ? (value.value as string | null) : null;
        const options = property.options ?? [];
        return (
          <select
            value={selectedId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { onChange(undefined); return; }
              onChange({ type: property.type as 'select', value: v });
            }}
            className={inputClass}
          >
            <option value="">— none —</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
        );
      }
      default:
        return (
          <span className="text-xs text-[var(--text-tertiary)] italic">
            Not editable here
          </span>
        );
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-secondary)] w-28 truncate flex-shrink-0">
        {property.name}
      </span>
      {renderEditor()}
    </div>
  );
}
