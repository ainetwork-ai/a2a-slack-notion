'use client';

import { useEffect, useState } from 'react';
import { Plus, Table2, Columns3, List, Calendar, LayoutGrid, GanttChart, BarChart2 } from 'lucide-react';
import type { ViewType } from '@/lib/notion/shared';
import { useDatabaseStore } from '@/lib/stores/notion-database-store';
import { TableView } from './table-view';
import { BoardView } from './board-view';
import { ListView } from './list-view';
import { CalendarView } from './calendar-view';
import { GalleryView } from './gallery-view';
import { TimelineView } from './timeline-view';
import { FilterToolbar } from './filter-toolbar';
import { ChartView } from './chart-view';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/notion/ui/popover';
import { cn } from '@/lib/utils';
import type { FilterGroup, SortRule } from '@/lib/notion/shared';

interface DatabaseViewProps {
  databaseId: string;
  inline?: boolean;
}

const VIEW_TYPE_ICONS: Record<ViewType, React.ComponentType<{ size?: number; className?: string }>> = {
  table: Table2,
  board: Columns3,
  list: List,
  calendar: Calendar,
  gallery: LayoutGrid,
  timeline: GanttChart,
};

export function DatabaseView({ databaseId, inline = false }: DatabaseViewProps) {
  const {
    database,
    schema,
    views,
    activeViewId,
    rows,
    loading,
    error,
    loadDatabase,
    setActiveView,
    createView,
    updateView,
    loadRows,
  } = useDatabaseStore();

  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewType, setNewViewType] = useState<ViewType>('table');
  const [chartOpen, setChartOpen] = useState(false);

  useEffect(() => {
    loadDatabase(databaseId).catch(console.error);
  }, [databaseId, loadDatabase]);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const properties = schema?.properties ?? [];

  function handleFiltersChange(filters: FilterGroup) {
    if (!activeView) return;
    updateView(activeView.id, { filters }).catch(console.error);
    loadRows(activeView.id).catch(console.error);
  }

  function handleSortsChange(sorts: SortRule[]) {
    if (!activeView) return;
    updateView(activeView.id, { sorts }).catch(console.error);
    loadRows(activeView.id).catch(console.error);
  }

  async function handleCreateView() {
    const name = newViewName.trim() || `${newViewType.charAt(0).toUpperCase()}${newViewType.slice(1)} view`;
    await createView(name, newViewType);
    setNewViewOpen(false);
    setNewViewName('');
  }

  if (loading) {
    return (
      <div
        className={cn(
          'flex flex-col',
          inline ? 'rounded-[6px] overflow-hidden' : 'h-full',
        )}
      >
        <DatabaseSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-[#eb5757]">{error}</p>
      </div>
    );
  }

  if (!database) return null;

  return (
    <div
      className={cn(
        'flex flex-col bg-[var(--bg-default)]',
        inline && 'rounded-[6px] shadow-[0_0_0_1px_rgba(15,15,15,0.05),0_2px_4px_rgba(15,15,15,0.1)] overflow-hidden my-2',
        !inline && 'h-full',
      )}
    >
      {/* Database title */}
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {database.properties.title || 'Untitled database'}
        </h2>
      </div>

      {/* View tabs + filter toolbar */}
      <div className="flex items-center justify-between px-2 border-b border-[var(--divider)]">
        {/* View tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {views.map((view) => {
            const Icon = VIEW_TYPE_ICONS[view.type] ?? Table2;
            const isActive = view.id === activeViewId;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors duration-[var(--duration-micro)] border-b-2',
                  isActive
                    ? 'text-[var(--text-primary)] border-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
                )}
              >
                <Icon size={13} />
                {view.name}
              </button>
            );
          })}

          {/* New view button */}
          <Popover open={newViewOpen} onOpenChange={setNewViewOpen}>
            <PopoverTrigger>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] border-b-2 border-transparent"
              >
                <Plus size={13} />
                Add view
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-3 min-w-[220px]">
              <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2">New view</p>
              <input
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateView().catch(console.error);
                }}
                placeholder="View name..."
                autoFocus
                className="w-full px-2 py-1.5 mb-2 text-sm rounded-[3px] bg-[var(--bg-hover)] outline-none text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]"
              />
              <div className="grid grid-cols-3 gap-1 mb-3">
                {(['table', 'board', 'list', 'calendar', 'gallery', 'timeline'] as ViewType[]).map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewViewType(type)}
                      className={cn(
                        'flex flex-col items-center gap-1 px-2 py-2 rounded-[3px] text-xs text-[var(--text-secondary)] transition-colors duration-[var(--duration-micro)]',
                        newViewType === type
                          ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                          : 'hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      <Table2 size={16} />
                      <span className="capitalize">{type}</span>
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={() => handleCreateView().catch(console.error)}
                className="w-full py-1.5 rounded-[3px] bg-[var(--accent-blue)] text-white text-sm hover:bg-[var(--accent-blue)]/90 transition-colors duration-[var(--duration-micro)]"
              >
                Create view
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Filter / sort toolbar + chart toggle */}
        <div className="flex items-center gap-1">
          {activeView && (
            <FilterToolbar
              properties={properties}
              filters={activeView.filters}
              sorts={activeView.sorts}
              onFiltersChange={handleFiltersChange}
              onSortsChange={handleSortsChange}
            />
          )}
          <button
            type="button"
            title={chartOpen ? 'Hide chart' : 'Show chart'}
            onClick={() => setChartOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 text-xs rounded-[3px] transition-colors duration-[var(--duration-micro)]',
              chartOpen
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            <BarChart2 size={13} />
            <span>Chart</span>
          </button>
        </div>
      </div>

      {/* Chart panel — shown above main view content when toggled */}
      {chartOpen && (
        <ChartView properties={properties} rows={rows} />
      )}

      {/* View content */}
      <div className="flex-1 overflow-auto">
        {activeView?.type === 'table' || !activeView ? (
          <TableView
            properties={properties}
            rows={rows}
            activeView={activeView}
          />
        ) : activeView.type === 'board' ? (
          <BoardView
            properties={properties}
            rows={rows}
            activeView={activeView}
          />
        ) : activeView.type === 'list' ? (
          <ListView
            properties={properties}
            rows={rows}
            activeView={activeView}
          />
        ) : activeView.type === 'calendar' ? (
          <CalendarView
            properties={properties}
            rows={rows}
            activeView={activeView}
          />
        ) : activeView.type === 'gallery' ? (
          <GalleryView
            properties={properties}
            rows={rows}
            activeView={activeView}
          />
        ) : activeView.type === 'timeline' ? (
          <TimelineView
            properties={properties}
            rows={rows}
            activeView={activeView}
          />
        ) : null}
      </div>
    </div>
  );
}

function DatabaseSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Fake tab bar */}
      <div className="flex gap-2 px-4 py-2 border-b border-[var(--divider)]">
        <div className="h-6 w-16 rounded bg-[var(--bg-hover)]" />
        <div className="h-6 w-12 rounded bg-[var(--bg-hover)]" />
      </div>
      {/* Fake header */}
      <div className="flex border-b border-[var(--divider)] h-8">
        <div className="w-10 flex-shrink-0 border-r border-[var(--divider)]" />
        {[300, 200, 160, 180].map((w, i) => (
          <div key={i} className="flex-shrink-0 border-r border-[var(--divider)] px-2 flex items-center" style={{ width: w }}>
            <div className="h-3 w-3/4 rounded bg-[var(--bg-hover)]" />
          </div>
        ))}
      </div>
      {/* Fake rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex border-b border-[var(--divider)] h-[34px]">
          <div className="w-10 flex-shrink-0 border-r border-[var(--divider)]" />
          {[300, 200, 160, 180].map((w, j) => (
            <div key={j} className="flex-shrink-0 border-r border-[var(--divider)] px-2 flex items-center" style={{ width: w }}>
              <div className="h-3 rounded bg-[var(--bg-hover)]" style={{ width: `${60 + Math.random() * 30}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
