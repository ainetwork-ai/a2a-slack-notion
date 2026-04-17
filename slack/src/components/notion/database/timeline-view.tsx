'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PropertyDefinition, DatabaseViewData } from '@/lib/notion/shared';
import type { DatabaseRow } from '@/lib/stores/notion-database-store';
import { useDatabaseStore } from '@/lib/stores/notion-database-store';
import { cn } from '@/lib/utils';

interface TimelineViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
  activeView: DatabaseViewData | null;
}

type ZoomLevel = 'day' | 'week' | 'month';

const SIDEBAR_WIDTH = 200;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;

// Column widths per zoom level (in px)
const ZOOM_COL_WIDTH: Record<ZoomLevel, number> = {
  day: 40,
  week: 100,
  month: 140,
};

export function TimelineView({ properties, rows, activeView }: TimelineViewProps) {
  const { updateView } = useDatabaseStore();

  const startPropertyId = activeView?.config.timelineStartProperty;
  const endPropertyId = activeView?.config.timelineEndProperty;
  const initialZoom: ZoomLevel = (activeView?.config.timelineZoom as ZoomLevel) ?? 'week';

  const [zoom, setZoom] = useState<ZoomLevel>(initialZoom);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startProp =
    (startPropertyId ? properties.find((p) => p.id === startPropertyId) : null) ??
    properties.find((p) => p.type === 'date') ??
    null;

  const endProp =
    (endPropertyId ? properties.find((p) => p.id === endPropertyId) : null) ??
    (startProp ? properties.filter((p) => p.type === 'date').find((p) => p.id !== startProp?.id) : null) ??
    null;

  const titleProp = properties.find((p) => p.type === 'title');

  if (!startProp) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-tertiary)]">
        Add a Date property to enable Timeline view.
      </div>
    );
  }

  // Determine visible date range: from earliest row start to latest row end, +/- buffer
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allDates: Date[] = [today];
  for (const row of rows) {
    const startVal = row.properties.values[startProp.id];
    if (startVal?.type === 'date' && startVal.value?.start) {
      allDates.push(new Date(startVal.value.start));
    }
    if (endProp) {
      const endVal = row.properties.values[endProp.id];
      if (endVal?.type === 'date' && endVal.value?.start) {
        allDates.push(new Date(endVal.value.start));
      }
    }
  }

  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

  // Add buffer: 4 weeks before/after
  minDate.setDate(minDate.getDate() - 28);
  maxDate.setDate(maxDate.getDate() + 28);

  // Build timeline columns
  const columns = buildColumns(minDate, maxDate, zoom);
  const totalWidth = columns.length * ZOOM_COL_WIDTH[zoom];

  function getRowTitle(row: DatabaseRow): string {
    if (!titleProp) return 'Untitled';
    const val = row.properties.values[titleProp.id];
    return val?.type === 'title' && val.value ? val.value : 'Untitled';
  }

  function dateToOffset(date: Date): number {
    const diffMs = date.getTime() - minDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return (diffDays / daysPerColumn(zoom)) * ZOOM_COL_WIDTH[zoom];
  }

  const todayOffset = dateToOffset(today);

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const targetScroll = Math.max(0, todayOffset - scrollRef.current.clientWidth / 2);
      scrollRef.current.scrollLeft = targetScroll;
    }
  }, []);

  const handleZoomChange = useCallback(
    (newZoom: ZoomLevel) => {
      setZoom(newZoom);
      if (activeView) {
        updateView(activeView.id, {
          config: { ...activeView.config, timelineZoom: newZoom },
        }).catch(console.error);
      }
    },
    [activeView, updateView],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar: zoom controls */}
      <div className="flex items-center justify-end gap-1 px-3 py-2 border-b border-[var(--divider)] flex-shrink-0">
        {(['day', 'week', 'month'] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => handleZoomChange(z)}
            className={cn(
              'px-2.5 py-1 rounded-[3px] text-xs capitalize transition-colors duration-[var(--duration-micro)]',
              zoom === z
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            {z}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: row labels */}
        <div
          className="flex flex-col flex-shrink-0 border-r border-[var(--divider)] bg-[var(--bg-default)] z-[5]"
          style={{ width: SIDEBAR_WIDTH }}
        >
          {/* Sidebar header spacer */}
          <div
            className="flex-shrink-0 border-b border-[var(--divider)] bg-[var(--bg-default)]"
            style={{ height: HEADER_HEIGHT }}
          />
          {/* Row labels */}
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center px-3 border-b border-[var(--divider)] flex-shrink-0"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="text-sm text-[var(--text-primary)] truncate">
                {getRowTitle(row)}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div style={{ width: totalWidth, minWidth: totalWidth }}>
            {/* Header */}
            <div
              className="sticky top-0 z-[4] flex bg-[var(--bg-default)] border-b border-[var(--divider)]"
              style={{ height: HEADER_HEIGHT }}
            >
              {columns.map((col, idx) => (
                <div
                  key={idx}
                  className="flex-shrink-0 flex items-center justify-center border-r border-[var(--divider)] text-xs text-[var(--text-secondary)]"
                  style={{ width: ZOOM_COL_WIDTH[zoom] }}
                >
                  {col.label}
                </div>
              ))}
            </div>

            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-[var(--accent-blue)] opacity-70 pointer-events-none z-[3]"
              style={{ left: todayOffset + ZOOM_COL_WIDTH[zoom] / 2 }}
            />

            {/* Rows */}
            {rows.map((row) => {
              const startVal = row.properties.values[startProp.id];
              const endVal = endProp ? row.properties.values[endProp.id] : null;

              let barLeft = 0;
              let barWidth = ZOOM_COL_WIDTH[zoom]; // default: single-column dot
              let hasStart = false;

              if (startVal?.type === 'date' && startVal.value?.start) {
                const start = new Date(startVal.value.start);
                start.setHours(0, 0, 0, 0);
                barLeft = dateToOffset(start);
                hasStart = true;

                if (endVal?.type === 'date' && endVal.value?.start) {
                  const end = new Date(endVal.value.start);
                  end.setHours(0, 0, 0, 0);
                  barWidth = Math.max(
                    ZOOM_COL_WIDTH[zoom],
                    dateToOffset(end) - barLeft + ZOOM_COL_WIDTH[zoom],
                  );
                } else {
                  barWidth = ZOOM_COL_WIDTH[zoom];
                }
              }

              return (
                <div
                  key={row.id}
                  className="relative border-b border-[var(--divider)] flex-shrink-0"
                  style={{ height: ROW_HEIGHT, width: totalWidth }}
                >
                  {/* Subtle column grid lines */}
                  {columns.map((_, idx) => (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 border-r border-[var(--divider)] opacity-50"
                      style={{ left: idx * ZOOM_COL_WIDTH[zoom], width: ZOOM_COL_WIDTH[zoom] }}
                    />
                  ))}

                  {hasStart && (
                    <div
                      className="absolute top-[6px] h-6 rounded-[3px] bg-[var(--accent-blue)] flex items-center px-2 overflow-hidden"
                      style={{ left: barLeft, width: barWidth }}
                    >
                      <span className="text-xs text-white truncate font-medium">
                        {getRowTitle(row)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----

function daysPerColumn(zoom: ZoomLevel): number {
  switch (zoom) {
    case 'day': return 1;
    case 'week': return 7;
    case 'month': return 30;
  }
}

interface TimelineColumn {
  label: string;
  date: Date;
}

function buildColumns(start: Date, end: Date, zoom: ZoomLevel): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  // Align cursor to start of period
  if (zoom === 'week') {
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() - day); // align to Sunday
  } else if (zoom === 'month') {
    cursor.setDate(1); // align to 1st
  }

  while (cursor <= end) {
    let label = '';
    if (zoom === 'day') {
      label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    } else if (zoom === 'week') {
      const weekNum = getWeekNumber(cursor);
      label = `W${weekNum}`;
    } else {
      label = cursor.toLocaleString('default', { month: 'short', year: '2-digit' });
    }

    cols.push({ label, date: new Date(cursor) });

    if (zoom === 'day') {
      cursor.setDate(cursor.getDate() + 1);
    } else if (zoom === 'week') {
      cursor.setDate(cursor.getDate() + 7);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return cols;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
