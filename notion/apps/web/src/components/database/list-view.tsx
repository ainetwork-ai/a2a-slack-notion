'use client';

import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { PropertyDefinition, DatabaseViewData, PropertyColor } from '@notion/shared';
import type { DatabaseRow } from '@/stores/database';
import { useDatabaseStore } from '@/stores/database';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ListViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
  activeView: DatabaseViewData | null;
}

interface RowGroup {
  key: string;
  label: string;
  color: PropertyColor;
  rows: DatabaseRow[];
}

export function ListView({ properties, rows, activeView }: ListViewProps) {
  const { createRow } = useDatabaseStore();

  const titleProp = properties.find((p) => p.type === 'title');
  const visiblePropertyIds = activeView?.config.visibleProperties ?? properties.map((p) => p.id);
  const previewProps = properties.filter(
    (p) =>
      p.type !== 'title' &&
      visiblePropertyIds.includes(p.id) &&
      !['created_time', 'created_by', 'last_edited_time', 'last_edited_by'].includes(p.type),
  ).slice(0, 4);

  const groupByRule = activeView?.groupBy;
  const groupByProp = groupByRule
    ? properties.find((p) => p.id === groupByRule.propertyId)
    : null;

  function getRowTitle(row: DatabaseRow): string {
    if (!titleProp) return 'Untitled';
    const val = row.properties.values[titleProp.id];
    return val?.type === 'title' && val.value ? val.value : 'Untitled';
  }

  const handleAddRow = useCallback(
    (groupValue?: string | null) => {
      const values: Record<string, { type: 'select'; value: string | null }> = {};
      if (groupByProp && groupValue !== undefined) {
        values[groupByProp.id] = { type: 'select', value: groupValue };
      }
      createRow(Object.keys(values).length > 0 ? values : undefined).catch(console.error);
    },
    [groupByProp, createRow],
  );

  // Build groups if groupBy is configured
  let groups: RowGroup[] | null = null;
  if (groupByProp && (groupByProp.type === 'select' || groupByProp.type === 'status')) {
    const options = groupByProp.options ?? [];
    const hiddenIds = groupByRule?.hidden ?? [];

    groups = options
      .filter((opt) => !hiddenIds.includes(opt.id))
      .map((opt) => ({
        key: opt.id,
        label: opt.name,
        color: (opt.color as PropertyColor) ?? 'default',
        rows: rows.filter((row) => {
          const val = row.properties.values[groupByProp.id];
          return (
            (val?.type === 'select' || val?.type === 'status') && val.value === opt.id
          );
        }),
      }));

    // Add "No value" group
    const noValueRows = rows.filter((row) => {
      const val = row.properties.values[groupByProp.id];
      return !val || ((val.type === 'select' || val.type === 'status') && val.value === null);
    });
    if (noValueRows.length > 0) {
      groups.push({ key: '__no_value__', label: 'No value', color: 'default', rows: noValueRows });
    }
  }

  if (groups) {
    return (
      <div className="divide-y divide-[var(--divider)]">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-sidebar)]">
              <Badge label={group.label} color={group.color} />
              <span className="text-xs text-[var(--text-tertiary)]">{group.rows.length}</span>
            </div>
            {group.rows.map((row) => (
              <ListRow
                key={row.id}
                row={row}
                title={getRowTitle(row)}
                previewProps={previewProps}
              />
            ))}
            <button
              type="button"
              onClick={() => handleAddRow(group.key === '__no_value__' ? null : group.key)}
              className="flex items-center gap-1.5 w-full px-4 py-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
            >
              <Plus size={12} />
              New
            </button>
          </div>
        ))}
      </div>
    );
  }

  // Ungrouped
  return (
    <div>
      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-[var(--text-tertiary)] mb-3">No rows yet</p>
          <button
            type="button"
            onClick={() => handleAddRow()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            <Plus size={14} />
            Add a row
          </button>
        </div>
      ) : (
        <>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              row={row}
              title={getRowTitle(row)}
              previewProps={previewProps}
            />
          ))}
          <button
            type="button"
            onClick={() => handleAddRow()}
            className="flex items-center gap-1.5 w-full px-4 py-2.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] border-t border-[var(--divider)]"
          >
            <Plus size={13} />
            New
          </button>
        </>
      )}
    </div>
  );
}

interface ListRowProps {
  row: DatabaseRow;
  title: string;
  previewProps: PropertyDefinition[];
}

function ListRow({ row, title, previewProps }: ListRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-[var(--divider)]',
        'hover:bg-[var(--bg-hover)] cursor-pointer transition-colors duration-[var(--duration-micro)]',
      )}
    >
      <span className="text-sm text-[var(--text-primary)] font-medium min-w-0 flex-1 truncate">
        {title}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {previewProps.map((prop) => {
          const val = row.properties.values[prop.id];
          if (!val) return null;
          return <ListPropertyPreview key={prop.id} prop={prop} value={val} />;
        })}
      </div>
    </div>
  );
}

function ListPropertyPreview({
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
        {val.value ? '☑' : '☐'}
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
      <span className="text-xs text-[var(--text-secondary)]">{String(val.value)}</span>
    );
  }

  if (typeof val.value === 'string' && val.value) {
    return (
      <span className="text-xs text-[var(--text-secondary)] truncate max-w-[80px]">
        {val.value}
      </span>
    );
  }

  return null;
}
