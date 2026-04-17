'use client';

import { useState, useEffect } from 'react';
import type { RollupConfig, RollupFunction, PropertyDefinition } from '@/lib/notion/shared';
import { apiFetch } from '@/lib/notion/api-client';
import { cn } from '@/lib/utils';

interface RollupConfigProps {
  propertyId: string;
  rollup?: RollupConfig;
  properties: PropertyDefinition[];
  onSave: (config: RollupConfig) => void;
  onClose: () => void;
}

const ROLLUP_FUNCTIONS: { value: RollupFunction; label: string }[] = [
  { value: 'count', label: 'Count all' },
  { value: 'count_values', label: 'Count values' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'median', label: 'Median' },
  { value: 'range', label: 'Range' },
  { value: 'percent_empty', label: 'Percent empty' },
  { value: 'percent_not_empty', label: 'Percent not empty' },
  { value: 'show_original', label: 'Show original' },
  { value: 'show_unique', label: 'Show unique' },
];

interface RemotePropertyDef {
  id: string;
  name: string;
  type: string;
}

export function RollupConfigPanel({
  rollup,
  properties,
  onSave,
  onClose,
}: RollupConfigProps) {
  const relationProperties = properties.filter((p) => p.type === 'relation');

  const [relationPropertyId, setRelationPropertyId] = useState(
    rollup?.relationPropertyId ?? relationProperties[0]?.id ?? '',
  );
  const [targetPropertyId, setTargetPropertyId] = useState(rollup?.targetPropertyId ?? '');
  const [fn, setFn] = useState<RollupFunction>(rollup?.function ?? 'count');

  const [relatedProperties, setRelatedProperties] = useState<RemotePropertyDef[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Fetch properties of the related database when relation property changes
  useEffect(() => {
    if (!relationPropertyId) {
      setRelatedProperties([]);
      return;
    }
    const relProp = properties.find((p) => p.id === relationPropertyId);
    if (!relProp?.relation?.relatedDatabaseId) {
      setRelatedProperties([]);
      return;
    }
    const dbId = relProp.relation.relatedDatabaseId;
    setLoadingRelated(true);
    apiFetch<{ schema: { properties: RemotePropertyDef[] } }>(
      `/api/v1/databases/${dbId}`,
    )
      .then((data) => {
        setRelatedProperties(data.schema.properties ?? []);
        // Default to first property of related DB if not set
        if (!targetPropertyId && data.schema.properties.length > 0) {
          setTargetPropertyId(data.schema.properties[0]!.id);
        }
      })
      .catch(() => setRelatedProperties([]))
      .finally(() => setLoadingRelated(false));
  }, [relationPropertyId]);

  function handleSave() {
    if (!relationPropertyId || !targetPropertyId) return;
    onSave({ relationPropertyId, targetPropertyId, function: fn });
  }

  const canSave = Boolean(relationPropertyId && targetPropertyId);

  const selectClass = cn(
    'w-full px-2 py-1.5 rounded-[3px] text-sm bg-[var(--bg-hover)] text-[var(--text-primary)] outline-none',
    'focus:shadow-[inset_0_0_0_2px_var(--accent-blue)] cursor-pointer',
  );

  return (
    <div className="p-3 w-[280px]">
      <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
        Configure Rollup
      </p>

      {/* 1. Relation */}
      <div className="mb-3">
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Relation</label>
        {relationProperties.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">
            No relation properties found. Add a relation property first.
          </p>
        ) : (
          <select
            value={relationPropertyId}
            onChange={(e) => {
              setRelationPropertyId(e.target.value);
              setTargetPropertyId('');
            }}
            className={selectClass}
          >
            {relationProperties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 2. Target property in related DB */}
      <div className="mb-3">
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Property</label>
        {loadingRelated ? (
          <p className="text-xs text-[var(--text-tertiary)]">Loading…</p>
        ) : relatedProperties.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">Select a relation first</p>
        ) : (
          <select
            value={targetPropertyId}
            onChange={(e) => setTargetPropertyId(e.target.value)}
            className={selectClass}
          >
            {relatedProperties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 3. Rollup function */}
      <div className="mb-4">
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Calculate</label>
        <select
          value={fn}
          onChange={(e) => setFn(e.target.value as RollupFunction)}
          className={selectClass}
        >
          {ROLLUP_FUNCTIONS.map((rf) => (
            <option key={rf.value} value={rf.value}>
              {rf.label}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-[3px] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            'px-3 py-1.5 rounded-[3px] text-sm font-medium transition-colors duration-[var(--duration-micro)]',
            canSave
              ? 'bg-[var(--accent-blue)] text-white hover:opacity-90'
              : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] cursor-not-allowed',
          )}
        >
          Save
        </button>
      </div>
    </div>
  );
}
