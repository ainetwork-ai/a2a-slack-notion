'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/notion/api-client';
import { Badge } from '@/components/notion/ui/badge';
import { cn } from '@/lib/utils';

interface RelatedRow {
  id: string;
  title: string;
}

interface RelationPickerProps {
  databaseId: string;
  relatedDatabaseId: string;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onClose: () => void;
}

export function RelationPicker({
  relatedDatabaseId,
  selectedIds,
  onSelect,
  onClose,
}: RelationPickerProps) {
  const [rows, setRows] = useState<RelatedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch<{ rows: { id: string; properties: { values: Record<string, { type: string; value: string }> } }[] }>(
      `/api/v1/databases/${relatedDatabaseId}/rows`,
    )
      .then((data) => {
        const mapped = data.rows.map((row) => {
          // Find title property value
          const titleEntry = Object.values(row.properties.values).find(
            (v) => v.type === 'title',
          );
          return {
            id: row.id,
            title: titleEntry?.value ?? 'Untitled',
          };
        });
        setRows(mapped);
      })
      .catch(() => {
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [relatedDatabaseId]);

  const filtered = rows.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter((x) => x !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  }

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));

  return (
    <div className="w-[280px]">
      {/* Selected pills */}
      {selectedRows.length > 0 && (
        <div className="px-2 pt-2 pb-1 flex flex-wrap gap-1 border-b border-[var(--divider)]">
          {selectedRows.map((r) => (
            <Badge
              key={r.id}
              label={r.title}
              color="blue"
              onRemove={() => toggle(r.id)}
            />
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--divider)]">
        <Search size={13} className="text-[var(--text-tertiary)] flex-shrink-0" />
        <input
          autoFocus
          type="text"
          placeholder="Search rows…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          className="flex-1 text-sm bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
      </div>

      {/* Row list */}
      <div className="max-h-[240px] overflow-y-auto p-1">
        {loading ? (
          <p className="px-2 py-3 text-sm text-[var(--text-tertiary)] text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[var(--text-tertiary)] text-center">No rows found</p>
        ) : (
          filtered.map((row) => {
            const checked = selectedIds.includes(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggle(row.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-[3px] text-sm text-left',
                  'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
                  checked && 'text-[var(--text-primary)]',
                )}
              >
                <span
                  className={cn(
                    'flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center text-[10px]',
                    checked
                      ? 'bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white'
                      : 'border-[var(--divider)]',
                  )}
                >
                  {checked ? '✓' : ''}
                </span>
                <span className="truncate text-[var(--text-primary)]">{row.title}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
