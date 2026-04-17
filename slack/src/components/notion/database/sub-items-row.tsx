'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/notion/api-client';
import type { PropertyDefinition, DatabaseViewData } from '@/lib/notion/shared';
import type { DatabaseRow } from '@/lib/stores/notion-database-store';
import { PropertyCell } from './property-cell';
import { cn } from '@/lib/utils';

const MAX_DEPTH = 3;
const ROW_HEIGHT = 34;

interface SubItemsRowProps {
  row: DatabaseRow;
  properties: PropertyDefinition[];
  depth: number;
  activeView: DatabaseViewData | null;
  getColWidth?: (prop: PropertyDefinition) => number;
}

const DEFAULT_COL_WIDTH = 200;
const TITLE_COL_WIDTH = 300;

function getDefaultColWidth(prop: PropertyDefinition): number {
  return prop.type === 'title' ? TITLE_COL_WIDTH : DEFAULT_COL_WIDTH;
}

export function SubItemsRow({
  row,
  properties,
  depth,
  activeView,
  getColWidth,
}: SubItemsRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [subItems, setSubItems] = useState<DatabaseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const colWidthFn = getColWidth ?? getDefaultColWidth;

  const fetchSubItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ rows: DatabaseRow[] }>(
        `/api/v1/databases/${row.databaseId}/rows?parent_row_id=${row.id}`,
      );
      setSubItems(data.rows);
    } catch {
      setSubItems([]);
    } finally {
      setLoading(false);
    }
  }, [row.databaseId, row.id]);

  useEffect(() => {
    if (expanded) {
      fetchSubItems().catch(() => null);
    }
  }, [expanded, fetchSubItems]);

  async function handleAddSubItem() {
    try {
      const created = await apiFetch<DatabaseRow>(
        `/api/v1/databases/${row.databaseId}/rows`,
        {
          method: 'POST',
          body: JSON.stringify({
            values: {},
            parentRowId: row.id,
          }),
        },
      );
      setSubItems((prev) => [...prev, created]);
      setExpanded(true);
    } catch {
      // silently fail — parent should handle errors
    }
  }

  const values = row.properties.values;
  const indentPx = depth * 24;

  return (
    <>
      {/* Main row */}
      <div
        className="flex border-b border-[var(--divider)] group hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
        style={{ height: ROW_HEIGHT }}
      >
        {/* Row number / indent + expand toggle */}
        <div
          className="flex-shrink-0 flex items-center justify-end border-r border-[var(--divider)]"
          style={{ width: 40 + indentPx }}
        >
          {depth < MAX_DEPTH && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'w-5 h-5 flex items-center justify-center rounded-[3px]',
                'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                'transition-colors duration-[var(--duration-micro)]',
              )}
              title={expanded ? 'Collapse sub-items' : 'Expand sub-items'}
            >
              <ChevronRight
                size={12}
                className={cn(
                  'transition-transform duration-150',
                  expanded && 'rotate-90',
                )}
              />
            </button>
          )}
        </div>

        {/* Cells */}
        {properties.map((prop) => (
          <div
            key={prop.id}
            className="flex-shrink-0 border-r border-[var(--divider)] last:border-r-0 overflow-hidden"
            style={{ width: colWidthFn(prop), height: ROW_HEIGHT }}
          >
            <PropertyCell
              definition={prop}
              value={values[prop.id]}
              onChange={() => {
                // Sub-item cell changes handled by parent update logic
              }}
            />
          </div>
        ))}

        {/* Add sub-item button (shown on hover for non-max-depth rows) */}
        {depth < MAX_DEPTH && (
          <button
            type="button"
            onClick={handleAddSubItem}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-opacity duration-[var(--duration-micro)]"
            title="Add sub-item"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Sub-items (recursive) */}
      {expanded && (
        <>
          {loading ? (
            <div
              className="flex items-center border-b border-[var(--divider)]"
              style={{ height: ROW_HEIGHT, paddingLeft: (depth + 1) * 24 + 40 }}
            >
              <span className="text-xs text-[var(--text-tertiary)]">Loading…</span>
            </div>
          ) : (
            subItems.map((subRow) => (
              <SubItemsRow
                key={subRow.id}
                row={subRow}
                properties={properties}
                depth={depth + 1}
                activeView={activeView}
                getColWidth={getColWidth}
              />
            ))
          )}
        </>
      )}
    </>
  );
}
