'use client';

import { useState, useCallback } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import type { PropertyDefinition, PropertyValue, DatabaseViewData } from '@notion/shared';
import type { DatabaseRow } from '@/stores/database';
import { useDatabaseStore } from '@/stores/database';
import { PropertyHeader } from './property-header';
import { PropertyCell } from './property-cell';
import { SubItemsRow } from './sub-items-row';
import { RowDetailModal } from './row-detail-modal';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { AddPropertyMenu } from './add-property-menu';
import { TemplatePicker } from './template-picker';
import { cn } from '@/lib/utils';
import type { PropertyType } from '@notion/shared';

const DEFAULT_COL_WIDTH = 160;
const TITLE_COL_WIDTH = 260;
const ROW_HEIGHT = 34;

interface TableViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
  activeView: DatabaseViewData | null;
  workspaceId?: string;
}

export function TableView({ properties, rows, activeView, workspaceId }: TableViewProps) {
  const { createRow, createRowFromTemplate, updateRow, deleteRow, addProperty, updateProperty, deleteProperty, updateView, templates } =
    useDatabaseStore();

  const [addPropOpen, setAddPropOpen] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Column widths from view config
  const colWidths: Record<string, number> = activeView?.config.columnWidths ?? {};
  const visiblePropertyIds = activeView?.config.visibleProperties ?? properties.map((p) => p.id);

  // Deduplicate: only show the first title-type property (API bug may create extras)
  let titleSeen = false;
  const visibleProperties = properties.filter((p) => {
    if (p.type === 'title') {
      if (titleSeen) return false;
      titleSeen = true;
      return true;
    }
    return visiblePropertyIds.includes(p.id);
  });

  function getColWidth(prop: PropertyDefinition): number {
    if (prop.type === 'title') return colWidths[prop.id] ?? TITLE_COL_WIDTH;
    return colWidths[prop.id] ?? DEFAULT_COL_WIDTH;
  }

  const handleResize = useCallback(
    (propertyId: string, newWidth: number) => {
      if (!activeView) return;
      updateView(activeView.id, {
        config: {
          ...activeView.config,
          columnWidths: {
            ...activeView.config.columnWidths,
            [propertyId]: newWidth,
          },
        },
      }).catch(console.error);
    },
    [activeView, updateView],
  );

  const handleCellChange = useCallback(
    (rowId: string, propertyId: string, value: PropertyValue) => {
      updateRow(rowId, { [propertyId]: value }).catch(console.error);
    },
    [updateRow],
  );

  const handleAddProperty = useCallback(
    (type: PropertyType) => {
      setAddPropOpen(false);
      const name = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
      addProperty({ name, type }).catch(console.error);
    },
    [addProperty],
  );

  const handleAddRow = useCallback(() => {
    if (templates.length > 0) {
      setTemplatePickerOpen(true);
    } else {
      createRow().catch(console.error);
    }
  }, [createRow, templates.length]);

  const handleSelectTemplate = useCallback(
    (templateId: string | null) => {
      if (templateId) {
        createRowFromTemplate(templateId).catch(console.error);
      } else {
        createRow().catch(console.error);
      }
      setTemplatePickerOpen(false);
    },
    [createRow, createRowFromTemplate],
  );

  const selectedRow = selectedRowId ? (rows.find((r) => r.id === selectedRowId) ?? null) : null;
  const totalWidth = visibleProperties.reduce((sum, p) => sum + getColWidth(p), 0) + 40; // 40 for row number

  return (
    <div className="overflow-auto">
      <div style={{ minWidth: totalWidth }}>
        {/* Header row */}
        <div
          className="flex sticky top-0 z-[10] bg-[var(--bg-default)] border-b border-[var(--divider)]"
          style={{ height: ROW_HEIGHT }}
        >
          {/* Row number column */}
          <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-[var(--divider)]">
            <span className="sr-only">Row</span>
          </div>

          {visibleProperties.map((prop) => (
            <div
              key={prop.id}
              className="flex-shrink-0 border-r border-[var(--divider)] last:border-r-0"
              style={{ width: getColWidth(prop), height: ROW_HEIGHT }}
            >
              <PropertyHeader
                definition={prop}
                width={getColWidth(prop)}
                onResize={(w) => handleResize(prop.id, w)}
                onUpdate={(updates) => updateProperty(prop.id, updates).catch(console.error)}
                onDelete={() => deleteProperty(prop.id).catch(console.error)}
              />
            </div>
          ))}

          {/* Add property button */}
          <Popover open={addPropOpen} onOpenChange={setAddPropOpen}>
            <PopoverTrigger>
              <button
                type="button"
                className="flex items-center justify-center w-9 h-full text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)] flex-shrink-0"
                title="Add property"
              >
                <Plus size={14} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0">
              <AddPropertyMenu onSelect={handleAddProperty} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Data rows — only top-level rows (no parentRowId) */}
        {rows.length === 0 ? (
          <EmptyState onAddRow={handleAddRow} />
        ) : (
          <>
            {rows
              .filter((row) => {
                const parentVal = row.properties.values['__parentRowId'];
                return !parentVal || (parentVal as { type: string; value: unknown }).value == null;
              })
              .map((row, rowIndex) => (
              <TableRow
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                properties={visibleProperties}
                getColWidth={getColWidth}
                isHovered={hoveredRowId === row.id}
                onHover={() => setHoveredRowId(row.id)}
                onHoverEnd={() => setHoveredRowId(null)}
                onCellChange={handleCellChange}
                onDelete={() => deleteRow(row.id).catch(console.error)}
                activeView={activeView}
                workspaceId={workspaceId}
                onOpenDetail={() => setSelectedRowId(row.id)}
              />
            ))}

            {selectedRow && (
              <RowDetailModal
                row={selectedRow}
                properties={visibleProperties}
                workspaceId={workspaceId ?? ''}
                onClose={() => setSelectedRowId(null)}
                onUpdate={handleCellChange}
              />
            )}

            {/* Add row button — shows template picker if templates exist */}
            <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className={cn(
                    'flex items-center w-full border-b border-[var(--divider)] text-[var(--text-tertiary)]',
                    'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="w-10 flex-shrink-0 flex items-center justify-center">
                    <Plus size={13} />
                  </div>
                  <span className="text-sm">New</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <TemplatePicker
                  templates={templates}
                  onSelectTemplate={handleSelectTemplate}
                  onClose={() => setTemplatePickerOpen(false)}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Individual row ----

interface TableRowProps {
  row: DatabaseRow;
  rowIndex: number;
  properties: PropertyDefinition[];
  getColWidth: (prop: PropertyDefinition) => number;
  isHovered: boolean;
  onHover: () => void;
  onHoverEnd: () => void;
  onCellChange: (rowId: string, propertyId: string, value: PropertyValue) => void;
  onDelete: () => void;
  activeView: DatabaseViewData | null;
  workspaceId?: string;
  onOpenDetail: () => void;
}

function TableRow({
  row,
  rowIndex,
  properties,
  getColWidth,
  isHovered,
  onHover,
  onHoverEnd,
  onCellChange,
  onDelete,
  activeView,
  workspaceId,
  onOpenDetail,
}: TableRowProps) {
  const [subItemsOpen, setSubItemsOpen] = useState(false);
  const values = row.properties.values;

  return (
    <>
      <div
        className={cn(
          'flex border-b border-[var(--divider)] group',
          isHovered && 'bg-[var(--bg-hover)]',
        )}
        style={{ height: ROW_HEIGHT }}
        onMouseEnter={onHover}
        onMouseLeave={onHoverEnd}
      >
        {/* Row number + sub-items toggle */}
        <div className="w-10 flex-shrink-0 flex items-center justify-center border-r border-[var(--divider)] text-xs text-[var(--text-tertiary)]">
          {isHovered ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSubItemsOpen((v) => !v)}
                className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-opacity duration-[var(--duration-micro)] text-xs leading-none"
                title={subItemsOpen ? 'Collapse sub-items' : 'Expand sub-items'}
              >
                {subItemsOpen ? '▾' : '▸'}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[#eb5757] transition-opacity duration-[var(--duration-micro)] text-xs leading-none"
                title="Delete row"
              >
                ×
              </button>
            </div>
          ) : (
            <span>{rowIndex + 1}</span>
          )}
        </div>

        {properties.map((prop) => (
          <div
            key={prop.id}
            className="flex-shrink-0 border-r border-[var(--divider)] last:border-r-0 overflow-hidden relative"
            style={{ width: getColWidth(prop), height: ROW_HEIGHT }}
          >
            <PropertyCell
              definition={prop}
              value={values[prop.id]}
              onChange={(value) => onCellChange(row.id, prop.id, value)}
              rowIndex={rowIndex}
              workspaceId={workspaceId}
            />
            {prop.type === 'title' && isHovered && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded-[3px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                title="Open detail"
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Sub-items */}
      {subItemsOpen && (
        <SubItemsRow
          row={row}
          properties={properties}
          depth={1}
          activeView={activeView}
          getColWidth={getColWidth}
        />
      )}
    </>
  );
}

// ---- Empty state ----

function EmptyState({ onAddRow }: { onAddRow: () => void }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-[var(--text-tertiary)] mb-3">No rows yet</p>
      <button
        type="button"
        onClick={onAddRow}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
      >
        <Plus size={14} />
        Add a row
      </button>
    </div>
  );
}
