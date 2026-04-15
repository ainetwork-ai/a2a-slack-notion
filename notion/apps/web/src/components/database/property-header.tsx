'use client';

import { useState, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { PropertyDefinition, PropertyType, FormulaConfig, RollupConfig } from '@notion/shared';
import { AUTO_PROPERTIES } from '@notion/shared';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { PropertyIcon, AddPropertyMenu } from './add-property-menu';
import { FormulaEditor } from './formula-editor';
import { RollupConfigPanel } from './rollup-config';
import { cn } from '@/lib/utils';

interface PropertyHeaderProps {
  definition: PropertyDefinition;
  width: number;
  onResize: (newWidth: number) => void;
  onUpdate: (updates: Partial<PropertyDefinition>) => void;
  onDelete: () => void;
}

export function PropertyHeader({
  definition,
  width,
  onResize,
  onUpdate,
  onDelete,
}: PropertyHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(definition.name);
  const [changingType, setChangingType] = useState(false);
  const [editingFormula, setEditingFormula] = useState(false);
  const [editingRollup, setEditingRollup] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartW = useRef<number>(width);
  const isAuto = AUTO_PROPERTIES.includes(definition.type);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartW.current = width;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - dragStartX.current;
      onResize(Math.max(80, dragStartW.current + delta));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function commitRename() {
    setRenaming(false);
    if (nameValue.trim() && nameValue !== definition.name) {
      onUpdate({ name: nameValue.trim() });
    }
  }

  return (
    <div
      className="relative flex items-center h-full select-none group"
      style={{ width }}
    >
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger className="flex-1 min-w-0">
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 px-2 h-full w-full text-left text-xs font-medium text-[var(--text-secondary)]',
              'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
            )}
          >
            <PropertyIcon
              type={definition.type}
              size={13}
              className="flex-shrink-0 text-[var(--text-tertiary)]"
            />
            <span className="truncate">{definition.name}</span>
          </button>
        </PopoverTrigger>

        <PopoverContent className="p-0 min-w-[220px]">
          {editingFormula ? (
            <FormulaEditor
              propertyId={definition.id}
              formula={definition.formula}
              properties={[]}
              onSave={(config: FormulaConfig) => {
                onUpdate({ formula: config });
                setEditingFormula(false);
                setMenuOpen(false);
              }}
              onClose={() => setEditingFormula(false)}
            />
          ) : editingRollup ? (
            <RollupConfigPanel
              propertyId={definition.id}
              rollup={definition.rollup}
              properties={[]}
              onSave={(config: RollupConfig) => {
                onUpdate({ rollup: config });
                setEditingRollup(false);
                setMenuOpen(false);
              }}
              onClose={() => setEditingRollup(false)}
            />
          ) : !changingType ? (
            <div className="p-1">
              {/* Rename */}
              <div className="px-2 py-1.5">
                <input
                  value={nameValue}
                  autoFocus={renaming}
                  onChange={(e) => setNameValue(e.target.value)}
                  onFocus={() => setRenaming(true)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') {
                      setNameValue(definition.name);
                      setRenaming(false);
                    }
                  }}
                  className="w-full px-2 py-1 text-sm rounded-[3px] bg-[var(--bg-hover)] outline-none text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]"
                  placeholder="Property name"
                />
              </div>

              <div className="h-px bg-[var(--divider)] my-1" />

              {/* Formula-specific action */}
              {definition.type === 'formula' && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingFormula(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                  >
                    Edit formula
                  </button>
                  <div className="h-px bg-[var(--divider)] my-1" />
                </>
              )}

              {/* Rollup-specific action */}
              {definition.type === 'rollup' && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingRollup(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                  >
                    Configure rollup
                  </button>
                  <div className="h-px bg-[var(--divider)] my-1" />
                </>
              )}

              {/* Relation: show related DB name */}
              {definition.type === 'relation' && definition.relation?.relatedDatabaseId && (
                <>
                  <div className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
                    Related DB:{' '}
                    <span className="text-[var(--text-secondary)]">
                      {definition.relation.relatedDatabaseId}
                    </span>
                  </div>
                  <div className="h-px bg-[var(--divider)] my-1" />
                </>
              )}

              {/* Change type */}
              {!isAuto && (
                <button
                  type="button"
                  onClick={() => setChangingType(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                >
                  <PropertyIcon
                    type={definition.type}
                    size={13}
                    className="text-[var(--text-secondary)]"
                  />
                  <span>
                    Type:{' '}
                    <span className="text-[var(--text-secondary)] capitalize">
                      {definition.type.replace(/_/g, ' ')}
                    </span>
                  </span>
                </button>
              )}

              {/* Delete */}
              {definition.type !== 'title' && !isAuto && (
                <>
                  <div className="h-px bg-[var(--divider)] my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-[#eb5757] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                  >
                    <Trash2 size={13} />
                    Delete property
                  </button>
                </>
              )}
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setChangingType(false)}
                className="flex items-center gap-1 px-2 py-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                ← Back
              </button>
              <AddPropertyMenu
                onSelect={(type: PropertyType) => {
                  onUpdate({ type });
                  setChangingType(false);
                  setMenuOpen(false);
                }}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-[var(--accent-blue)] transition-opacity duration-[var(--duration-micro)]"
      />
    </div>
  );
}
