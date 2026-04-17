'use client';

import { FileText, Plus } from 'lucide-react';
import type { DatabaseTemplate } from '@/lib/notion/shared';
import { cn } from '@/lib/utils';

interface TemplatePickerProps {
  templates: DatabaseTemplate[];
  onSelectTemplate: (templateId: string | null) => void;
  onClose: () => void;
}

export function TemplatePicker({ templates, onSelectTemplate, onClose }: TemplatePickerProps) {
  function handleSelect(templateId: string | null) {
    onSelectTemplate(templateId);
    onClose();
  }

  return (
    <div className="py-1 min-w-[220px]">
      <p className="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
        New row
      </p>

      {/* Empty page option */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-[var(--text-primary)]',
          'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
        )}
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-[3px] bg-[var(--bg-hover)] flex-shrink-0">
          <Plus size={13} className="text-[var(--text-secondary)]" />
        </div>
        <span>Empty page</span>
      </button>

      {templates.length > 0 && (
        <>
          <div className="mx-3 my-1 h-px bg-[var(--divider)]" />
          <p className="px-3 py-1 text-xs font-medium text-[var(--text-tertiary)]">
            Templates
          </p>
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleSelect(tmpl.id)}
              className={cn(
                'w-full flex items-start gap-2.5 px-3 py-1.5 text-sm text-left',
                'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
              )}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-[3px] bg-[var(--bg-hover)] flex-shrink-0 mt-0.5">
                {tmpl.icon ? (
                  <span className="text-sm leading-none">{tmpl.icon}</span>
                ) : (
                  <FileText size={13} className="text-[var(--text-secondary)]" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[var(--text-primary)] truncate">{tmpl.name}</span>
                {tmpl.description && (
                  <span className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                    {tmpl.description}
                  </span>
                )}
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
