'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PropertyDefinition, DatabaseViewData } from '@notion/shared';
import type { DatabaseRow } from '@/stores/database';
import { useDatabaseStore } from '@/stores/database';
import { cn } from '@/lib/utils';

interface CalendarViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
  activeView: DatabaseViewData | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({ properties, rows, activeView }: CalendarViewProps) {
  const { createRow } = useDatabaseStore();
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const calendarDatePropertyId = activeView?.config.calendarDateProperty;
  const dateProp =
    properties.find((p) => p.id === calendarDatePropertyId) ??
    properties.find((p) => p.type === 'date') ??
    null;

  const titleProp = properties.find((p) => p.type === 'title');

  if (!dateProp) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-tertiary)]">
        Add a Date property to enable Calendar view.
      </div>
    );
  }

  const { year, month } = currentDate;
  const today = new Date();
  const todayStr = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  function prevMonth() {
    setCurrentDate((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function nextMonth() {
    setCurrentDate((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    const d = new Date();
    setCurrentDate({ year: d.getFullYear(), month: d.getMonth() });
  }

  // Build the 6-week grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { year: number; month: number; day: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    cells.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year, month, day: d, isCurrentMonth: true });
  }

  // Next month padding to complete the grid
  const remaining = 42 - cells.length; // always 6 rows × 7 cols
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month + 1, d);
    cells.push({ year: dt.getFullYear(), month: dt.getMonth(), day: d, isCurrentMonth: false });
  }

  // Map rows to date keys
  const rowsByDate: Record<string, DatabaseRow[]> = {};
  for (const row of rows) {
    const val = row.properties.values[dateProp.id];
    if (val?.type === 'date' && val.value?.start) {
      const d = new Date(val.value.start);
      const key = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!rowsByDate[key]) rowsByDate[key] = [];
      rowsByDate[key].push(row);
    }
  }

  function getRowTitle(row: DatabaseRow): string {
    if (!titleProp) return 'Untitled';
    const val = row.properties.values[titleProp.id];
    return val?.type === 'title' && val.value ? val.value : 'Untitled';
  }

  const handleDayClick = useCallback(
    (cellYear: number, cellMonth: number, cellDay: number) => {
      const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
      createRow({ [dateProp.id]: { type: 'date', value: { start: dateStr } } }).catch(console.error);
    },
    [dateProp.id, createRow],
  );

  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full">
      {/* Navigation header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--divider)]">
        <button
          type="button"
          onClick={goToday}
          className="px-2.5 py-1 rounded-[3px] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] shadow-[0_0_0_1px_var(--divider)]"
        >
          Today
        </button>
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 rounded-[3px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)]"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 rounded-[3px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)]"
        >
          <ChevronRight size={16} />
        </button>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{monthName}</span>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-[var(--divider)]">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="py-1.5 text-center text-xs font-medium text-[var(--text-secondary)]"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-auto">
        {cells.map((cell, idx) => {
          const key = formatDateKey(cell.year, cell.month, cell.day);
          const cellRows = rowsByDate[key] ?? [];
          const isToday = key === todayStr;

          return (
            <div
              key={idx}
              className={cn(
                'border-r border-b border-[var(--divider)] p-1.5 min-h-[90px] cursor-pointer',
                'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
                !cell.isCurrentMonth && 'opacity-40',
              )}
              onClick={() => handleDayClick(cell.year, cell.month, cell.day)}
            >
              <div className="flex items-center justify-center w-6 h-6 mb-1">
                <span
                  className={cn(
                    'text-xs font-medium leading-none w-6 h-6 flex items-center justify-center rounded-full',
                    isToday
                      ? 'bg-[var(--accent-blue)] text-white'
                      : 'text-[var(--text-secondary)]',
                  )}
                >
                  {cell.day}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {cellRows.slice(0, 3).map((row) => (
                  <div
                    key={row.id}
                    className="truncate rounded-[2px] px-1 py-0.5 text-[11px] leading-tight bg-[var(--accent-blue)] text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {getRowTitle(row)}
                  </div>
                ))}
                {cellRows.length > 3 && (
                  <span className="text-[10px] text-[var(--text-tertiary)] px-1">
                    +{cellRows.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
