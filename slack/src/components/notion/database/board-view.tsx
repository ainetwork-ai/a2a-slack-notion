'use client';

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { PropertyDefinition, DatabaseViewData, PropertyColor } from '@/lib/notion/shared';
import type { DatabaseRow } from '@/lib/stores/notion-database-store';
import { useDatabaseStore } from '@/lib/stores/notion-database-store';
import { Badge } from '@/components/notion/ui/badge';
import { cn } from '@/lib/utils';

interface BoardViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
  activeView: DatabaseViewData | null;
}

interface BoardColumn {
  id: string | null;
  name: string;
  color: PropertyColor;
  rows: DatabaseRow[];
}

export function BoardView({ properties, rows, activeView }: BoardViewProps) {
  const { createRow, updateRow } = useDatabaseStore();
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Find the groupBy property
  const boardGroupById = activeView?.config.boardGroupBy;
  const groupByProp =
    properties.find((p) => p.id === boardGroupById) ??
    properties.find((p) => p.type === 'select' || p.type === 'status') ??
    null;

  if (!groupByProp) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-tertiary)]">
        Add a Select or Status property to enable Board view grouping.
      </div>
    );
  }

  const options = groupByProp.options ?? [];

  // Build columns: one per option + "No value" column
  const columns: BoardColumn[] = [
    ...options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      color: (opt.color as PropertyColor) ?? 'default',
      rows: rows.filter((row) => {
        const val = row.properties.values[groupByProp.id];
        if (!val) return false;
        return (
          (val.type === 'select' || val.type === 'status') && val.value === opt.id
        );
      }),
    })),
    {
      id: null,
      name: 'No value',
      color: 'default',
      rows: rows.filter((row) => {
        const val = row.properties.values[groupByProp.id];
        if (!val) return true;
        return (
          (val.type === 'select' || val.type === 'status') && val.value === null
        );
      }),
    },
  ];

  const titleProp = properties.find((p) => p.type === 'title');
  const previewProps = properties
    .filter((p) => p.type !== 'title' && p.id !== groupByProp.id)
    .slice(0, 3);

  function getRowTitle(row: DatabaseRow): string {
    if (!titleProp) return 'Untitled';
    const val = row.properties.values[titleProp.id];
    return (val?.type === 'title' && val.value) ? val.value : 'Untitled';
  }

  const handleDragStart = useCallback((rowId: string) => {
    setDragRowId(rowId);
  }, []);

  const handleDrop = useCallback(
    (columnId: string | null) => {
      if (!dragRowId || !groupByProp) return;
      const newValue =
        groupByProp.type === 'select'
          ? { type: 'select' as const, value: columnId }
          : { type: 'status' as const, value: columnId };
      updateRow(dragRowId, { [groupByProp.id]: newValue }).catch(console.error);
      setDragRowId(null);
      setDragOverColumnId(null);
    },
    [dragRowId, groupByProp, updateRow],
  );

  const handleAddRow = useCallback(
    (columnId: string | null) => {
      const initialValues: Record<string, { type: 'select'; value: string | null } | { type: 'status'; value: string | null }> = {};
      if (groupByProp.type === 'select') {
        initialValues[groupByProp.id] = { type: 'select', value: columnId };
      } else {
        initialValues[groupByProp.id] = { type: 'status', value: columnId };
      }
      createRow(initialValues).catch(console.error);
    },
    [groupByProp, createRow],
  );

  return (
    <div className="flex gap-3 p-4 overflow-x-auto h-full items-start">
      {columns.map((col) => (
        <div
          key={col.id ?? '__no_value__'}
          className={cn(
            'flex flex-col flex-shrink-0 w-[260px] rounded-[6px] transition-colors duration-[var(--duration-micro)]',
            dragOverColumnId === (col.id ?? '__no_value__') && 'bg-[var(--bg-hover)]',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverColumnId(col.id ?? '__no_value__');
          }}
          onDragLeave={() => setDragOverColumnId(null)}
          onDrop={() => handleDrop(col.id)}
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-2 py-2 bg-[var(--bg-sidebar)] rounded-t-[6px]">
            <Badge label={col.name} color={col.color} />
            <span className="text-xs text-[var(--text-tertiary)] ml-auto">
              {col.rows.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2 p-2 min-h-[40px]">
            {col.rows.map((row) => (
              <BoardCard
                key={row.id}
                row={row}
                title={getRowTitle(row)}
                previewProps={previewProps}
                onDragStart={() => handleDragStart(row.id)}
                onDragEnd={() => setDragRowId(null)}
              />
            ))}
          </div>

          {/* Add card button */}
          <button
            type="button"
            onClick={() => handleAddRow(col.id)}
            className="flex items-center gap-1.5 px-2 py-1.5 mx-2 mb-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[3px] transition-colors duration-[var(--duration-micro)]"
          >
            <Plus size={12} />
            New
          </button>
        </div>
      ))}
    </div>
  );
}

interface BoardCardProps {
  row: DatabaseRow;
  title: string;
  previewProps: PropertyDefinition[];
  onDragStart: () => void;
  onDragEnd: () => void;
}

function BoardCard({ row, title, previewProps, onDragStart, onDragEnd }: BoardCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'bg-[var(--bg-default)] rounded-[6px] p-2.5 cursor-grab active:cursor-grabbing',
        'shadow-[0_0_0_1px_var(--divider),0_1px_3px_rgba(15,15,15,0.05)]',
        'hover:shadow-[0_0_0_1px_var(--divider),0_2px_6px_rgba(15,15,15,0.1)]',
        'transition-shadow duration-[var(--duration-micro)]',
      )}
    >
      <p className="text-sm text-[var(--text-primary)] font-medium leading-snug mb-1.5 break-words">
        {title}
      </p>
      {previewProps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {previewProps.map((prop) => {
            const val = row.properties.values[prop.id];
            if (!val) return null;
            return (
              <CardPropertyPreview key={prop.id} prop={prop} value={val} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardPropertyPreview({
  prop,
  value,
}: {
  prop: PropertyDefinition;
  value: DatabaseRow['properties']['values'][string];
}) {
  const val = value as { type: string; value: unknown };

  if (prop.type === 'select' || prop.type === 'status') {
    const optId = val.value as string | null;
    const opt = prop.options?.find((o) => o.id === optId);
    if (!opt) return null;
    return <Badge label={opt.name} color={(opt.color as PropertyColor) ?? 'default'} />;
  }

  if (prop.type === 'checkbox') {
    return (
      <span className="text-xs text-[var(--text-secondary)]">
        {val.value ? '☑' : '☐'} {prop.name}
      </span>
    );
  }

  if (prop.type === 'date') {
    const dateVal = val.value as { start: string } | null;
    if (!dateVal?.start) return null;
    return (
      <span className="text-xs text-[var(--text-secondary)]">
        {new Date(dateVal.start).toLocaleDateString()}
      </span>
    );
  }

  if (prop.type === 'number') {
    if (val.value === null || val.value === undefined) return null;
    return (
      <span className="text-xs text-[var(--text-secondary)]">
        {String(val.value)}
      </span>
    );
  }

  if (typeof val.value === 'string' && val.value) {
    return (
      <span className="text-xs text-[var(--text-secondary)] truncate max-w-[100px]">
        {val.value}
      </span>
    );
  }

  return null;
}
