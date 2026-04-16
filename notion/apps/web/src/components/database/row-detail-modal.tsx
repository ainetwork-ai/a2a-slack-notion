'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { PropertyDefinition, PropertyValue } from '@notion/shared';
import type { DatabaseRow } from '@/stores/database';
import { PropertyCell } from './property-cell';
import { cn } from '@/lib/utils';

interface RowDetailModalProps {
  row: DatabaseRow;
  properties: PropertyDefinition[];
  workspaceId: string;
  onClose: () => void;
  onUpdate: (rowId: string, propertyId: string, value: PropertyValue) => void;
}

export function RowDetailModal({ row, properties, workspaceId, onClose, onUpdate }: RowDetailModalProps) {
  const values = row.properties.values;
  const titleProp = properties.find((p) => p.type === 'title');
  const titleValue = titleProp ? (values[titleProp.id] as { type: 'title'; value: string } | undefined) : undefined;
  const [titleDraft, setTitleDraft] = useState(titleValue?.value ?? '');

  const nonTitleProperties = properties.filter((p) => p.type !== 'title');

  function handleTitleBlur() {
    if (!titleProp) return;
    onUpdate(row.id, titleProp.id, { type: 'title', value: titleDraft });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[var(--z-modal)] bg-black/20"
        onClick={onClose}
      />

      {/* Slide-in panel from right */}
      <div
        className={cn(
          'fixed right-0 top-0 bottom-0 z-[var(--z-modal)] w-[480px]',
          'bg-[var(--bg-default)] shadow-[var(--shadow-modal)]',
          'flex flex-col overflow-hidden',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--divider)] shrink-0">
          <span className="text-xs text-[var(--text-tertiary)] font-medium uppercase tracking-wide">Row detail</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            <X size={15} className="text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Editable title */}
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Untitled"
            className="w-full text-[22px] font-bold text-[var(--text-primary)] bg-transparent outline-none placeholder:text-[var(--text-tertiary)] mb-4"
          />

          {/* Properties grid */}
          <div className="space-y-1">
            {nonTitleProperties.map((prop) => (
              <div key={prop.id} className="flex items-center min-h-[34px] rounded-[3px] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]">
                <div className="w-[140px] flex-shrink-0 px-2 text-xs text-[var(--text-tertiary)] font-medium truncate">
                  {prop.name}
                </div>
                <div className="flex-1 min-w-0 h-[34px]">
                  <PropertyCell
                    definition={prop}
                    value={values[prop.id]}
                    onChange={(value) => onUpdate(row.id, prop.id, value)}
                    workspaceId={workspaceId}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
