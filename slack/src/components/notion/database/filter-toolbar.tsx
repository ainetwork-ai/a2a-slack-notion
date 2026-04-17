'use client';

import { useState } from 'react';
import { Filter, ArrowUpDown, X } from 'lucide-react';
import type {
  FilterGroup,
  FilterCondition,
  FilterOperator,
  SortRule,
  SortDirection,
  PropertyDefinition,
} from '@/lib/notion/shared';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/notion/ui/popover';
import { Button } from '@/components/notion/ui/button';
import { cn } from '@/lib/utils';

interface FilterToolbarProps {
  properties: PropertyDefinition[];
  filters: FilterGroup;
  sorts: SortRule[];
  onFiltersChange: (filters: FilterGroup) => void;
  onSortsChange: (sorts: SortRule[]) => void;
}

const TEXT_OPERATORS: FilterOperator[] = [
  'equals', 'does_not_equal', 'contains', 'does_not_contain',
  'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
];
const NUMBER_OPERATORS: FilterOperator[] = [
  'equals', 'does_not_equal', 'greater_than', 'less_than',
  'greater_than_or_equal', 'less_than_or_equal', 'is_empty', 'is_not_empty',
];
const DATE_OPERATORS: FilterOperator[] = [
  'equals', 'before', 'after', 'on_or_before', 'on_or_after',
  'is_empty', 'is_not_empty',
];
const CHECKBOX_OPERATORS: FilterOperator[] = ['is_checked', 'is_not_checked'];

function operatorsForType(type: string): FilterOperator[] {
  if (type === 'number') return NUMBER_OPERATORS;
  if (type === 'date' || type === 'created_time' || type === 'last_edited_time') return DATE_OPERATORS;
  if (type === 'checkbox') return CHECKBOX_OPERATORS;
  return TEXT_OPERATORS;
}

function operatorLabel(op: FilterOperator): string {
  return op.replace(/_/g, ' ');
}

export function FilterToolbar({
  properties,
  filters,
  sorts,
  onFiltersChange,
  onSortsChange,
}: FilterToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const activeFilterCount = filters.conditions.length;
  const activeSortCount = sorts.length;

  function addFilter() {
    const first = properties[0];
    if (!first) return;
    const newCondition: FilterCondition = {
      propertyId: first.id,
      operator: (operatorsForType(first.type)[0] ?? 'equals') as FilterOperator,
    };
    onFiltersChange({
      ...filters,
      conditions: [...filters.conditions, newCondition],
    });
  }

  function updateFilter(index: number, updates: Partial<FilterCondition>) {
    const conditions = filters.conditions.map((c, i) =>
      i === index ? { ...c, ...updates } : c,
    );
    onFiltersChange({ ...filters, conditions });
  }

  function removeFilter(index: number) {
    onFiltersChange({
      ...filters,
      conditions: filters.conditions.filter((_, i) => i !== index),
    });
  }

  function addSort() {
    const first = properties[0];
    if (!first) return;
    if (sorts.find((s) => s.propertyId === first.id)) return;
    onSortsChange([...sorts, { propertyId: first.id, direction: 'ascending' }]);
  }

  function updateSort(index: number, updates: Partial<SortRule>) {
    onSortsChange(sorts.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function removeSort(index: number) {
    onSortsChange(sorts.filter((_, i) => i !== index));
  }

  return (
    <div className="flex items-center gap-1">
      {/* Filter button */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'gap-1.5 text-xs text-[var(--text-secondary)] h-7',
              activeFilterCount > 0 && 'text-[var(--accent-blue)] bg-[var(--bg-active)]',
            )}
          >
            <Filter size={13} />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1 py-0.5 rounded bg-[var(--accent-blue)] text-white text-[10px] leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-3 min-w-[360px]">
          <div className="space-y-2">
            {filters.conditions.map((cond, i) => {
              const prop = properties.find((p) => p.id === cond.propertyId);
              const ops = operatorsForType(prop?.type ?? 'text');
              return (
                <div key={i} className="flex items-center gap-2">
                  {/* Property selector */}
                  <select
                    value={cond.propertyId}
                    onChange={(e) => updateFilter(i, { propertyId: e.target.value })}
                    className="flex-1 text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  {/* Operator selector */}
                  <select
                    value={cond.operator}
                    onChange={(e) => updateFilter(i, { operator: e.target.value as FilterOperator })}
                    className="flex-1 text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none"
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>{operatorLabel(op)}</option>
                    ))}
                  </select>

                  {/* Value input (if not empty/checked operators) */}
                  {!['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'].includes(cond.operator) && (
                    <input
                      value={typeof cond.value === 'string' ? cond.value : ''}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1 text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeFilter(i)}
                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

            <Button
              variant="ghost"
              size="sm"
              onClick={addFilter}
              className="text-xs text-[var(--text-secondary)] h-7 gap-1"
            >
              + Add filter
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Sort button */}
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'gap-1.5 text-xs text-[var(--text-secondary)] h-7',
              activeSortCount > 0 && 'text-[var(--accent-blue)] bg-[var(--bg-active)]',
            )}
          >
            <ArrowUpDown size={13} />
            Sort
            {activeSortCount > 0 && (
              <span className="ml-0.5 px-1 py-0.5 rounded bg-[var(--accent-blue)] text-white text-[10px] leading-none">
                {activeSortCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-3 min-w-[280px]">
          <div className="space-y-2">
            {sorts.map((sort, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={sort.propertyId}
                  onChange={(e) => updateSort(i, { propertyId: e.target.value })}
                  className="flex-1 text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <select
                  value={sort.direction}
                  onChange={(e) => updateSort(i, { direction: e.target.value as SortDirection })}
                  className="text-xs px-2 py-1 rounded-[3px] bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none"
                >
                  <option value="ascending">Ascending</option>
                  <option value="descending">Descending</option>
                </select>

                <button
                  type="button"
                  onClick={() => removeSort(i)}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={addSort}
              className="text-xs text-[var(--text-secondary)] h-7 gap-1"
            >
              + Add sort
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
