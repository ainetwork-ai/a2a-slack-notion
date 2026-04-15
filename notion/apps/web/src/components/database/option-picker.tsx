'use client';

import { useState, useRef, useEffect } from 'react';
import type { SelectOption } from '@notion/shared';
import type { PropertyColor } from '@notion/shared';
import { PROPERTY_COLORS } from '@notion/shared';
import { Badge, colorMap } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface OptionPickerProps {
  options: SelectOption[];
  selectedIds: string[];
  multiSelect?: boolean;
  onSelect: (optionId: string) => void;
  onDeselect: (optionId: string) => void;
  onCreateOption: (name: string) => void;
}

export function OptionPicker({
  options,
  selectedIds,
  multiSelect = false,
  onSelect,
  onDeselect,
  onCreateOption,
}: OptionPickerProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  const exactMatch = options.find(
    (o) => o.name.toLowerCase() === search.toLowerCase(),
  );

  function handleToggle(option: SelectOption) {
    if (selectedIds.includes(option.id)) {
      onDeselect(option.id);
    } else {
      if (!multiSelect) {
        // deselect all then select this one
        selectedIds.forEach((id) => onDeselect(id));
      }
      onSelect(option.id);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim()) {
      if (!exactMatch) {
        onCreateOption(search.trim());
        setSearch('');
      } else {
        handleToggle(exactMatch);
        setSearch('');
      }
    }
  }

  return (
    <div className="p-1 min-w-[220px]">
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search or create option..."
        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] border-b border-[var(--divider)] mb-1"
      />

      <div className="max-h-[240px] overflow-y-auto">
        {filtered.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleToggle(option)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-left transition-colors duration-[var(--duration-micro)]',
                selected
                  ? 'bg-[var(--bg-active)]'
                  : 'hover:bg-[var(--bg-hover)]',
              )}
            >
              <Badge
                label={option.name}
                color={(option.color as PropertyColor) ?? 'default'}
              />
              {selected && (
                <span className="ml-auto text-[var(--accent-blue)] text-xs">✓</span>
              )}
            </button>
          );
        })}

        {search.trim() && !exactMatch && (
          <button
            type="button"
            onClick={() => {
              onCreateOption(search.trim());
              setSearch('');
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-left hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            <span className="text-[var(--text-tertiary)]">Create</span>
            <Badge label={search.trim()} color="default" />
          </button>
        )}

        {filtered.length === 0 && !search.trim() && (
          <p className="px-2 py-3 text-xs text-[var(--text-tertiary)] text-center">
            No options yet. Type to create one.
          </p>
        )}
      </div>
    </div>
  );
}

// Color picker sub-component used in property config
interface ColorSwatchProps {
  selected: PropertyColor;
  onChange: (color: PropertyColor) => void;
}

export function ColorSwatch({ selected, onChange }: ColorSwatchProps) {
  return (
    <div className="flex flex-wrap gap-1 p-1">
      {PROPERTY_COLORS.map((color) => {
        const { bg } = colorMap[color];
        return (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onChange(color)}
            className={cn(
              'w-5 h-5 rounded-full transition-transform',
              selected === color && 'ring-2 ring-[var(--accent-blue)] ring-offset-1',
            )}
            style={{ backgroundColor: bg }}
          />
        );
      })}
    </div>
  );
}
