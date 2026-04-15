'use client';

import { useState, useRef, useEffect } from 'react';
import type { PropertyDefinition, PropertyValue, SelectOption, FormulaResult, RollupResult } from '@notion/shared';
import type { PropertyColor } from '@notion/shared';
import { AUTO_PROPERTIES } from '@notion/shared';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { OptionPicker } from './option-picker';
import { RelationPicker } from './relation-picker';

interface PropertyCellProps {
  definition: PropertyDefinition;
  value: PropertyValue | undefined;
  onChange: (value: PropertyValue) => void;
  rowIndex?: number;
  colIndex?: number;
}

export function PropertyCell({ definition, value, onChange }: PropertyCellProps) {
  const isAutomatic = AUTO_PROPERTIES.includes(definition.type);

  if (isAutomatic) {
    return <AutoCell definition={definition} value={value} />;
  }

  switch (definition.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return (
        <TextCell
          definition={definition}
          value={value as { type: typeof definition.type; value: string } | undefined}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <NumberCell
          definition={definition}
          value={value as { type: 'number'; value: number | null } | undefined}
          onChange={onChange}
        />
      );
    case 'checkbox':
      return (
        <CheckboxCell
          value={value as { type: 'checkbox'; value: boolean } | undefined}
          onChange={onChange}
        />
      );
    case 'date':
      return (
        <DateCell
          value={value as { type: 'date'; value: { start: string; end?: string; includeTime?: boolean } | null } | undefined}
          onChange={onChange}
        />
      );
    case 'select':
    case 'status':
      return (
        <SelectCell
          definition={definition}
          value={value as { type: 'select' | 'status'; value: string | null } | undefined}
          onChange={onChange}
        />
      );
    case 'multi_select':
      return (
        <MultiSelectCell
          definition={definition}
          value={value as { type: 'multi_select'; value: string[] } | undefined}
          onChange={onChange}
        />
      );
    case 'person':
      return <PersonCell value={value as { type: 'person'; value: string[] } | undefined} />;
    case 'files':
      return <FilesCell value={value as { type: 'files'; value: { name: string; url: string; size?: number }[] } | undefined} />;
    case 'formula':
      return <FormulaCell value={value as { type: 'formula'; value: FormulaResult } | undefined} />;
    case 'relation':
      return (
        <RelationCell
          definition={definition}
          value={value as { type: 'relation'; value: string[] } | undefined}
          onChange={onChange}
        />
      );
    case 'rollup':
      return <RollupCell value={value as { type: 'rollup'; value: RollupResult } | undefined} />;
    default:
      return <EmptyCell />;
  }
}

// ---- Text / URL / Email / Phone ----

interface TextCellProps {
  definition: PropertyDefinition;
  value: { type: string; value: string } | undefined;
  onChange: (value: PropertyValue) => void;
}

function TextCell({ definition, value, onChange }: TextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    onChange({ type: definition.type, value: draft } as PropertyValue);
  }

  if (!editing) {
    return (
      <div
        className="h-full w-full px-2 flex items-center cursor-text text-sm text-[var(--text-primary)] truncate"
        onClick={() => {
          setDraft(value?.value ?? '');
          setEditing(true);
        }}
      >
        {value?.value ? (
          <span className="truncate">{value.value}</span>
        ) : (
          <span className="text-[var(--text-tertiary)]" />
        )}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="h-full w-full px-2 text-sm bg-transparent outline-none text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]"
    />
  );
}

// ---- Number ----

interface NumberCellProps {
  definition: PropertyDefinition;
  value: { type: 'number'; value: number | null } | undefined;
  onChange: (value: PropertyValue) => void;
}

function formatNumber(num: number | null, format?: string): string {
  if (num === null || num === undefined) return '';
  switch (format) {
    case 'percent': return `${num}%`;
    case 'dollar': return `$${num.toLocaleString()}`;
    case 'euro': return `€${num.toLocaleString()}`;
    case 'won': return `₩${num.toLocaleString()}`;
    case 'yen': return `¥${num.toLocaleString()}`;
    case 'number_with_commas': return num.toLocaleString();
    default: return String(num);
  }
}

function NumberCell({ definition, value, onChange }: NumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.value !== null && value?.value !== undefined ? String(value.value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const num = draft.trim() === '' ? null : parseFloat(draft);
    onChange({ type: 'number', value: isNaN(num as number) ? null : num });
  }

  if (!editing) {
    return (
      <div
        className="h-full w-full px-2 flex items-center justify-end cursor-text text-sm text-[var(--text-primary)]"
        onClick={() => {
          setDraft(value?.value !== null && value?.value !== undefined ? String(value.value) : '');
          setEditing(true);
        }}
      >
        {formatNumber(value?.value ?? null, definition.numberFormat)}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="h-full w-full px-2 text-sm text-right bg-transparent outline-none text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]"
    />
  );
}

// ---- Checkbox ----

interface CheckboxCellProps {
  value: { type: 'checkbox'; value: boolean } | undefined;
  onChange: (value: PropertyValue) => void;
}

function CheckboxCell({ value, onChange }: CheckboxCellProps) {
  const checked = value?.value ?? false;
  return (
    <div className="h-full w-full flex items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange({ type: 'checkbox', value: e.target.checked })}
        className="w-4 h-4 cursor-pointer accent-[var(--accent-blue)]"
      />
    </div>
  );
}

// ---- Date ----

interface DateCellProps {
  value: { type: 'date'; value: { start: string; end?: string; includeTime?: boolean } | null } | undefined;
  onChange: (value: PropertyValue) => void;
}

function DateCell({ value, onChange }: DateCellProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const dateStr = value?.value?.start ?? '';

  function commit(newDate: string) {
    setEditing(false);
    onChange({ type: 'date', value: newDate ? { start: newDate } : null });
  }

  if (!editing) {
    return (
      <div
        className="h-full w-full px-2 flex items-center cursor-text text-sm text-[var(--text-primary)]"
        onClick={() => setEditing(true)}
      >
        {dateStr ? (
          <span>{new Date(dateStr).toLocaleDateString()}</span>
        ) : (
          <span className="text-[var(--text-tertiary)]" />
        )}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="date"
      defaultValue={dateStr}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        if (e.key === 'Escape') setEditing(false);
      }}
      className="h-full w-full px-2 text-sm bg-transparent outline-none text-[var(--text-primary)] focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]"
    />
  );
}

// ---- Select / Status ----

interface SelectCellProps {
  definition: PropertyDefinition;
  value: { type: 'select' | 'status'; value: string | null } | undefined;
  onChange: (value: PropertyValue) => void;
}

function SelectCell({ definition, value, onChange }: SelectCellProps) {
  const options: SelectOption[] = definition.options ?? [];
  const selected = options.find((o) => o.id === value?.value);

  function handleSelect(id: string) {
    onChange({ type: definition.type as 'select', value: id });
  }
  function handleDeselect() {
    onChange({ type: definition.type as 'select', value: null });
  }
  function handleCreate(_name: string) {
    // optimistic: just show the name as default color — real creation via parent
    const fakeId = `new-${Date.now()}`;
    onChange({ type: definition.type as 'select', value: fakeId });
    // Caller should handle actual option creation via updateProperty
    void fakeId;
  }

  return (
    <Popover>
      <PopoverTrigger className="h-full w-full">
        <div className="h-full w-full px-2 flex items-center gap-1 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]">
          {selected ? (
            <Badge
              label={selected.name}
              color={(selected.color as PropertyColor) ?? 'default'}
            />
          ) : null}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <OptionPicker
          options={options}
          selectedIds={value?.value ? [value.value] : []}
          multiSelect={false}
          onSelect={handleSelect}
          onDeselect={handleDeselect}
          onCreateOption={handleCreate}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---- Multi-select ----

interface MultiSelectCellProps {
  definition: PropertyDefinition;
  value: { type: 'multi_select'; value: string[] } | undefined;
  onChange: (value: PropertyValue) => void;
}

function MultiSelectCell({ definition, value, onChange }: MultiSelectCellProps) {
  const options: SelectOption[] = definition.options ?? [];
  const selectedIds = value?.value ?? [];
  const selectedOptions = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is SelectOption => Boolean(o));

  function handleSelect(id: string) {
    onChange({ type: 'multi_select', value: [...selectedIds, id] });
  }
  function handleDeselect(id: string) {
    onChange({ type: 'multi_select', value: selectedIds.filter((x) => x !== id) });
  }
  function handleCreate(_name: string) {
    void name;
  }

  return (
    <Popover>
      <PopoverTrigger className="h-full w-full">
        <div className="h-full w-full px-2 flex items-center flex-wrap gap-1 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]">
          {selectedOptions.map((opt) => (
            <Badge
              key={opt.id}
              label={opt.name}
              color={(opt.color as PropertyColor) ?? 'default'}
            />
          ))}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <OptionPicker
          options={options}
          selectedIds={selectedIds}
          multiSelect={true}
          onSelect={handleSelect}
          onDeselect={handleDeselect}
          onCreateOption={handleCreate}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---- Person ----

interface PersonCellProps {
  value: { type: 'person'; value: string[] } | undefined;
}

function PersonCell({ value }: PersonCellProps) {
  const ids = value?.value ?? [];
  return (
    <div className="h-full w-full px-2 flex items-center gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-blue)] text-white text-[10px] font-medium"
        >
          {id.charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ---- Files ----

interface FilesCellProps {
  value: { type: 'files'; value: { name: string; url: string; size?: number }[] } | undefined;
}

function FilesCell({ value }: FilesCellProps) {
  const files = value?.value ?? [];
  return (
    <div className="h-full w-full px-2 flex items-center">
      {files.length > 0 ? (
        <Badge label={`${files.length} file${files.length > 1 ? 's' : ''}`} color="default" />
      ) : null}
    </div>
  );
}

// ---- Auto properties (read-only) ----

interface AutoCellProps {
  definition: PropertyDefinition;
  value: PropertyValue | undefined;
}

function AutoCell({ definition, value }: AutoCellProps) {
  let display = '';
  if (!value) {
    // nothing
  } else if (definition.type === 'created_time' || definition.type === 'last_edited_time') {
    const v = value as { type: string; value: string };
    display = v.value ? new Date(v.value).toLocaleDateString() : '';
  } else {
    const v = value as { type: string; value: string };
    display = v.value ?? '';
  }

  return (
    <div className="h-full w-full px-2 flex items-center text-sm text-[var(--text-tertiary)] truncate">
      {display}
    </div>
  );
}

// ---- Formula (read-only) ----

interface FormulaCellProps {
  value: { type: 'formula'; value: FormulaResult } | undefined;
}

function FormulaCell({ value }: FormulaCellProps) {
  const result = value?.value;
  if (!result) return <div className="h-full w-full" />;

  if (result.type === 'error') {
    return (
      <div className="h-full w-full px-2 flex items-center text-xs truncate" style={{ color: '#eb5757' }}>
        {result.value}
      </div>
    );
  }

  if (result.type === 'boolean') {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <span className="text-sm">{result.value ? '✓' : '✗'}</span>
      </div>
    );
  }

  if (result.type === 'date') {
    const display = result.value ? new Date(result.value).toLocaleDateString() : '';
    return (
      <div className="h-full w-full px-2 flex items-center text-sm text-[var(--text-primary)] truncate">
        {display}
      </div>
    );
  }

  // string or number
  const display = result.type === 'number' ? String(result.value) : result.value;
  return (
    <div className="h-full w-full px-2 flex items-center text-sm text-[var(--text-primary)] truncate">
      {display}
    </div>
  );
}

// ---- Relation ----

interface RelationCellProps {
  definition: PropertyDefinition;
  value: { type: 'relation'; value: string[] } | undefined;
  onChange: (value: PropertyValue) => void;
}

function RelationCell({ definition, value, onChange }: RelationCellProps) {
  const selectedIds = value?.value ?? [];
  const relatedDatabaseId = definition.relation?.relatedDatabaseId ?? '';

  if (!relatedDatabaseId) {
    return (
      <div className="h-full w-full px-2 flex items-center text-xs text-[var(--text-tertiary)]">
        Not configured
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className="h-full w-full">
        <div className="h-full w-full px-2 flex items-center flex-wrap gap-1 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]">
          {selectedIds.length > 0 ? (
            selectedIds.slice(0, 3).map((id) => (
              <Badge key={id} label={id.slice(0, 8)} color="blue" />
            ))
          ) : null}
          {selectedIds.length > 3 && (
            <span className="text-xs text-[var(--text-tertiary)]">+{selectedIds.length - 3}</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <RelationPicker
          databaseId={definition.id}
          relatedDatabaseId={relatedDatabaseId}
          selectedIds={selectedIds}
          onSelect={(ids) => onChange({ type: 'relation', value: ids })}
          onClose={() => {}}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---- Rollup (read-only) ----

interface RollupCellProps {
  value: { type: 'rollup'; value: RollupResult } | undefined;
}

function RollupCell({ value }: RollupCellProps) {
  const result = value?.value;
  if (!result) return <div className="h-full w-full" />;

  if (result.type === 'error') {
    return (
      <div className="h-full w-full px-2 flex items-center text-xs truncate" style={{ color: '#eb5757' }}>
        {result.value}
      </div>
    );
  }

  if (result.type === 'number') {
    return (
      <div className="h-full w-full px-2 flex items-center justify-end text-sm text-[var(--text-primary)]">
        {result.value}
      </div>
    );
  }

  // array — show comma-separated, truncated to 3 with "+N more"
  const items = result.value as unknown[];
  const shown = items.slice(0, 3);
  const extra = items.length - 3;
  const display = shown.map((v) => String(v)).join(', ');

  return (
    <div className="h-full w-full px-2 flex items-center text-sm text-[var(--text-primary)] truncate">
      {display}
      {extra > 0 && (
        <span className="ml-1 text-xs text-[var(--text-tertiary)]">+{extra} more</span>
      )}
    </div>
  );
}

// ---- Empty ----

function EmptyCell() {
  return <div className="h-full w-full" />;
}
