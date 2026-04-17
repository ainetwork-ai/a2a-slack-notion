'use client';

import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { PropertyDefinition, DatabaseViewData, PropertyColor } from '@/lib/notion/shared';
import type { DatabaseRow } from '@/lib/stores/notion-database-store';
import { useDatabaseStore } from '@/lib/stores/notion-database-store';
import { Badge } from '@/components/notion/ui/badge';
import { cn } from '@/lib/utils';

interface GalleryViewProps {
  properties: PropertyDefinition[];
  rows: DatabaseRow[];
  activeView: DatabaseViewData | null;
}

const CARD_SIZES = {
  small: 180,
  medium: 240,
  large: 320,
} as const;

// Simple hash to pick a gradient from title
const GRADIENTS = [
  'from-blue-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-orange-400 to-rose-500',
  'from-violet-400 to-purple-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-cyan-500',
  'from-pink-400 to-rose-500',
  'from-lime-400 to-green-500',
];

function titleGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffffff;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length] ?? 'from-blue-400 to-indigo-500';
}

export function GalleryView({ properties, rows, activeView }: GalleryViewProps) {
  const { createRow } = useDatabaseStore();

  const coverPropertyId = activeView?.config.galleryCoverProperty;
  const cardSize = activeView?.config.galleryCardSize ?? 'medium';
  const cardWidth = CARD_SIZES[cardSize];

  const coverProp = coverPropertyId
    ? properties.find((p) => p.id === coverPropertyId)
    : properties.find((p) => p.type === 'files');

  const titleProp = properties.find((p) => p.type === 'title');
  const visiblePropertyIds = activeView?.config.visibleProperties ?? properties.map((p) => p.id);
  const previewProps = properties.filter(
    (p) =>
      p.type !== 'title' &&
      p.id !== coverProp?.id &&
      visiblePropertyIds.includes(p.id) &&
      !['created_time', 'created_by', 'last_edited_time', 'last_edited_by'].includes(p.type),
  ).slice(0, 3);

  function getRowTitle(row: DatabaseRow): string {
    if (!titleProp) return 'Untitled';
    const val = row.properties.values[titleProp.id];
    return val?.type === 'title' && val.value ? val.value : 'Untitled';
  }

  function getCoverUrl(row: DatabaseRow): string | null {
    if (!coverProp) return null;
    const val = row.properties.values[coverProp.id];
    if (val?.type === 'files' && val.value.length > 0) {
      return val.value[0]?.url ?? null;
    }
    return null;
  }

  const handleAddRow = useCallback(() => {
    createRow().catch(console.error);
  }, [createRow]);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-[var(--text-tertiary)] mb-3">No items yet</p>
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
        >
          <Plus size={14} />
          Add an item
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
        {rows.map((row) => {
          const title = getRowTitle(row);
          const coverUrl = getCoverUrl(row);

          return (
            <GalleryCard
              key={row.id}
              row={row}
              title={title}
              coverUrl={coverUrl}
              previewProps={previewProps}
              gradient={titleGradient(title)}
            />
          );
        })}

        {/* Add new card */}
        <button
          type="button"
          onClick={handleAddRow}
          className={cn(
            'flex items-center justify-center rounded-[6px] cursor-pointer',
            'shadow-[0_0_0_1px_var(--divider)]',
            'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
            'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
            'min-h-[120px]',
          )}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Plus size={20} />
            <span className="text-xs">New</span>
          </div>
        </button>
      </div>
    </div>
  );
}

interface GalleryCardProps {
  row: DatabaseRow;
  title: string;
  coverUrl: string | null;
  previewProps: PropertyDefinition[];
  gradient: string;
}

function GalleryCard({ row, title, coverUrl, previewProps, gradient }: GalleryCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-[6px] overflow-hidden cursor-pointer',
        'shadow-[0_0_0_1px_var(--divider),0_2px_4px_rgba(15,15,15,0.05)]',
        'hover:shadow-[0_0_0_1px_var(--divider),0_4px_12px_rgba(15,15,15,0.1)]',
        'hover:-translate-y-[1px]',
        'transition-[shadow,transform] duration-[var(--duration-micro)]',
        'bg-[var(--bg-default)]',
      )}
    >
      {/* Cover */}
      <div className="w-full h-[120px] flex-shrink-0 overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={cn(
              'w-full h-full bg-gradient-to-br opacity-80',
              gradient,
            )}
          />
        )}
      </div>

      {/* Content */}
      <div className="p-2.5 flex flex-col gap-1.5">
        <p className="text-sm font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
          {title}
        </p>
        {previewProps.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {previewProps.map((prop) => {
              const val = row.properties.values[prop.id];
              if (!val) return null;
              return <GalleryPropertyPreview key={prop.id} prop={prop} value={val} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GalleryPropertyPreview({
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
      <span className="text-xs text-[var(--text-secondary)]">{String(val.value)}</span>
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
