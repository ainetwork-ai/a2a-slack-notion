/**
 * Shared helpers for database routes.
 * Ported from apps/api/src/routes/databases.ts
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { blocks } from '@slack-db/schema';
import {
  AUTO_PROPERTIES,
  parseFormula,
  evaluateFormula,
  type PropertyDefinition,
  type PropertyValue,
  type DatabaseSchema,
  type DatabaseBlockProperties,
  type DatabaseRowProperties,
  type FilterGroup,
  type FilterCondition,
  type SortRule,
  type ViewConfig,
  type DateValue,
  type FormulaConfig,
  type RollupConfig,
  type FormulaResult,
  type RollupResult,
} from '@notion/shared';

export { AUTO_PROPERTIES };
export type {
  PropertyDefinition,
  PropertyValue,
  DatabaseSchema,
  DatabaseBlockProperties,
  DatabaseRowProperties,
  FilterGroup,
  FilterCondition,
  SortRule,
  ViewConfig,
  FormulaConfig,
  RollupConfig,
  FormulaResult,
  RollupResult,
};

export function computeFormula(
  formulaConfig: FormulaConfig,
  row: { id: string; properties: unknown },
  schema: DatabaseSchema,
): FormulaResult {
  try {
    const rowProps = row.properties as DatabaseRowProperties;
    const contextProperties: Record<string, unknown> = {};
    for (const propDef of schema.properties) {
      const val = rowProps.values?.[propDef.id];
      contextProperties[propDef.name] = val ?? null;
    }
    const ast = parseFormula(formulaConfig.expression);
    return evaluateFormula(ast, { properties: contextProperties });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', value: message };
  }
}

export async function computeRollup(
  rollupConfig: RollupConfig,
  currentRow: { id: string; properties: unknown },
  schema: DatabaseSchema,
): Promise<RollupResult> {
  try {
    const relationPropDef = schema.properties.find((p) => p.id === rollupConfig.relationPropertyId);
    if (!relationPropDef || relationPropDef.type !== 'relation') {
      return { type: 'error', value: 'Relation property not found' };
    }

    const rowProps = currentRow.properties as DatabaseRowProperties;
    const relationValue = rowProps.values?.[rollupConfig.relationPropertyId];
    if (!relationValue || relationValue.type !== 'relation') {
      return { type: 'number', value: 0 };
    }

    const relatedRowIds = relationValue.value as string[];
    if (relatedRowIds.length === 0) {
      return { type: 'number', value: 0 };
    }

    const relatedRows = await db
      .select()
      .from(blocks)
      .where(and(inArray(blocks.id, relatedRowIds), eq(blocks.archived, false)));

    const relatedDbId = relationPropDef.relation?.relatedDatabaseId;
    if (!relatedDbId) {
      return { type: 'error', value: 'Missing relatedDatabaseId on relation property' };
    }
    const relatedDb = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.id, relatedDbId), eq(blocks.type, 'database')))
      .limit(1)
      .then((r) => r[0]);
    if (!relatedDb) {
      return { type: 'error', value: 'Related database not found' };
    }

    const relatedSchema = (relatedDb.properties as unknown as DatabaseBlockProperties).schema;
    const targetPropDef = relatedSchema.properties.find((p) => p.id === rollupConfig.targetPropertyId);
    if (!targetPropDef) {
      return { type: 'error', value: 'Target property not found in related database' };
    }

    const values: unknown[] = relatedRows.map((r) => {
      const rp = r.properties as unknown as DatabaseRowProperties;
      return rp.values?.[rollupConfig.targetPropertyId] ?? null;
    });

    const fn = rollupConfig.function;

    const numValues = values
      .map((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'object' && v !== null && 'value' in v) {
          const inner = (v as { value: unknown }).value;
          return typeof inner === 'number' ? inner : null;
        }
        return typeof v === 'number' ? v : null;
      })
      .filter((v): v is number => v !== null);

    const isEmpty = (v: unknown): boolean => {
      if (v === null || v === undefined) return true;
      if (typeof v === 'object' && v !== null && 'value' in v) {
        const inner = (v as { value: unknown }).value;
        return inner === null || inner === undefined || inner === '';
      }
      return false;
    };

    switch (fn) {
      case 'count':
        return { type: 'number', value: relatedRows.length };
      case 'count_values':
        return { type: 'number', value: values.filter((v) => !isEmpty(v)).length };
      case 'sum':
        return { type: 'number', value: numValues.reduce((a, b) => a + b, 0) };
      case 'avg':
        return {
          type: 'number',
          value: numValues.length > 0 ? numValues.reduce((a, b) => a + b, 0) / numValues.length : 0,
        };
      case 'min':
        return { type: 'number', value: numValues.length > 0 ? Math.min(...numValues) : 0 };
      case 'max':
        return { type: 'number', value: numValues.length > 0 ? Math.max(...numValues) : 0 };
      case 'median': {
        const sorted = [...numValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const med =
          sorted.length === 0
            ? 0
            : sorted.length % 2 === 0
              ? (sorted[mid - 1]! + sorted[mid]!) / 2
              : sorted[mid]!;
        return { type: 'number', value: med };
      }
      case 'range': {
        if (numValues.length === 0) return { type: 'number', value: 0 };
        return { type: 'number', value: Math.max(...numValues) - Math.min(...numValues) };
      }
      case 'percent_empty': {
        if (values.length === 0) return { type: 'number', value: 0 };
        return { type: 'number', value: (values.filter(isEmpty).length / values.length) * 100 };
      }
      case 'percent_not_empty': {
        if (values.length === 0) return { type: 'number', value: 0 };
        return {
          type: 'number',
          value: (values.filter((v) => !isEmpty(v)).length / values.length) * 100,
        };
      }
      case 'show_original':
        return { type: 'array', value: values };
      case 'show_unique': {
        const seen = new Set<string>();
        const unique: unknown[] = [];
        for (const v of values) {
          const key = JSON.stringify(v);
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(v);
          }
        }
        return { type: 'array', value: unique };
      }
      default:
        return { type: 'error', value: `Unknown rollup function '${fn}'` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', value: message };
  }
}

export async function syncReverseRelation(
  rowAId: string,
  rowBId: string,
  reversePropertyId: string,
  add: boolean,
): Promise<void> {
  const rowB = await db
    .select()
    .from(blocks)
    .where(eq(blocks.id, rowBId))
    .limit(1)
    .then((r) => r[0]);
  if (!rowB) return;
  const bProps = rowB.properties as unknown as DatabaseRowProperties;
  const existing = bProps.values?.[reversePropertyId];
  const currentIds: string[] = existing?.type === 'relation' ? (existing.value as string[]) : [];
  let newIds: string[];
  if (add) {
    newIds = currentIds.includes(rowAId) ? currentIds : [...currentIds, rowAId];
  } else {
    newIds = currentIds.filter((id) => id !== rowAId);
  }
  const updatedValues: Record<string, PropertyValue> = {
    ...bProps.values,
    [reversePropertyId]: { type: 'relation', value: newIds },
  };
  await db
    .update(blocks)
    .set({ properties: { values: updatedValues } as Record<string, unknown> })
    .where(eq(blocks.id, rowBId));
}

export async function enrichRowWithComputedValues(
  row: { id: string; properties: unknown },
  schema: DatabaseSchema,
): Promise<{ id: string; properties: unknown }> {
  const rowProps = row.properties as DatabaseRowProperties;
  const computedValues: Record<string, PropertyValue> = {};

  for (const propDef of schema.properties) {
    if (propDef.type === 'formula' && propDef.formula) {
      const result = computeFormula(propDef.formula, row, schema);
      computedValues[propDef.id] = { type: 'formula', value: result };
    } else if (propDef.type === 'rollup' && propDef.rollup) {
      const result = await computeRollup(propDef.rollup, row, schema);
      computedValues[propDef.id] = { type: 'rollup', value: result };
    }
  }

  if (Object.keys(computedValues).length === 0) return row;

  return {
    ...row,
    properties: {
      values: { ...rowProps.values, ...computedValues },
    },
  };
}

export function evaluateCondition(
  condition: FilterCondition,
  rowProps: DatabaseRowProperties,
  schema: DatabaseSchema,
): boolean {
  const propDef = schema.properties.find((p) => p.id === condition.propertyId);
  if (!propDef) return true;

  const propValue = rowProps.values[condition.propertyId];
  const op = condition.operator;

  if (op === 'is_empty') {
    if (!propValue) return true;
    const v = propValue.value;
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') return v.trim() === '';
    return false;
  }
  if (op === 'is_not_empty') {
    if (!propValue) return false;
    const v = propValue.value;
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  }

  if (!propValue) return false;

  const type = propDef.type;

  if (type === 'title' || type === 'text' || type === 'url' || type === 'email' || type === 'phone') {
    const str = (propValue.value as string) ?? '';
    const filterStr = String(condition.value ?? '');
    switch (op) {
      case 'equals': return str === filterStr;
      case 'does_not_equal': return str !== filterStr;
      case 'contains': return str.includes(filterStr);
      case 'does_not_contain': return !str.includes(filterStr);
      case 'starts_with': return str.startsWith(filterStr);
      case 'ends_with': return str.endsWith(filterStr);
      default: return true;
    }
  }

  if (type === 'number') {
    const num = propValue.value as number | null;
    const filterNum = Number(condition.value);
    if (num === null) return false;
    switch (op) {
      case 'equals': return num === filterNum;
      case 'does_not_equal': return num !== filterNum;
      case 'greater_than': return num > filterNum;
      case 'less_than': return num < filterNum;
      case 'greater_than_or_equal': return num >= filterNum;
      case 'less_than_or_equal': return num <= filterNum;
      default: return true;
    }
  }

  if (type === 'select' || type === 'status') {
    const selected = propValue.value as string | null;
    const filterVal = condition.value as string | null;
    switch (op) {
      case 'equals': return selected === filterVal;
      case 'does_not_equal': return selected !== filterVal;
      default: return true;
    }
  }

  if (type === 'multi_select') {
    const selected = (propValue.value as string[]) ?? [];
    const filterVal = condition.value as string;
    switch (op) {
      case 'contains': return selected.includes(filterVal);
      case 'does_not_contain': return !selected.includes(filterVal);
      default: return true;
    }
  }

  if (type === 'date' || type === 'created_time' || type === 'last_edited_time') {
    let dateStr: string | null = null;
    if (type === 'date') {
      const dv = propValue.value as DateValue | null;
      dateStr = dv ? dv.start : null;
    } else {
      dateStr = propValue.value as string;
    }
    if (!dateStr) return false;
    const rowDate = new Date(dateStr).getTime();
    const filterDate = new Date(condition.value as string).getTime();
    switch (op) {
      case 'equals': return rowDate === filterDate;
      case 'does_not_equal': return rowDate !== filterDate;
      case 'before': return rowDate < filterDate;
      case 'after': return rowDate > filterDate;
      case 'on_or_before': return rowDate <= filterDate;
      case 'on_or_after': return rowDate >= filterDate;
      default: return true;
    }
  }

  if (type === 'checkbox') {
    const checked = propValue.value as boolean;
    switch (op) {
      case 'is_checked': return checked === true;
      case 'is_not_checked': return checked !== true;
      default: return true;
    }
  }

  if (type === 'person') {
    const people = (propValue.value as string[]) ?? [];
    const filterVal = condition.value as string;
    switch (op) {
      case 'contains': return people.includes(filterVal);
      case 'does_not_contain': return !people.includes(filterVal);
      default: return true;
    }
  }

  return true;
}

export function applyFilters(
  rows: Array<{ id: string; properties: unknown }>,
  filterGroup: FilterGroup,
  schema: DatabaseSchema,
): Array<{ id: string; properties: unknown }> {
  if (!filterGroup.conditions || filterGroup.conditions.length === 0) return rows;

  return rows.filter((row) => {
    const rowProps = row.properties as DatabaseRowProperties;
    if (filterGroup.logic === 'and') {
      return filterGroup.conditions.every((cond) => evaluateCondition(cond, rowProps, schema));
    } else {
      return filterGroup.conditions.some((cond) => evaluateCondition(cond, rowProps, schema));
    }
  });
}

export function applySorts<T extends { id: string; properties: unknown; createdAt: Date }>(
  rows: T[],
  sorts: SortRule[],
  schema: DatabaseSchema,
): T[] {
  if (!sorts || sorts.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const propDef = schema.properties.find((p) => p.id === sort.propertyId);
      if (!propDef) continue;

      const aProps = a.properties as DatabaseRowProperties;
      const bProps = b.properties as DatabaseRowProperties;
      const aVal = aProps.values?.[sort.propertyId]?.value;
      const bVal = bProps.values?.[sort.propertyId]?.value;

      let cmp = 0;
      if (aVal === null || aVal === undefined) cmp = -1;
      else if (bVal === null || bVal === undefined) cmp = 1;
      else if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        cmp = (aVal ? 1 : 0) - (bVal ? 1 : 0);
      } else if (Array.isArray(aVal) && Array.isArray(bVal)) {
        cmp = aVal.length - bVal.length;
      }

      if (cmp !== 0) {
        return sort.direction === 'ascending' ? cmp : -cmp;
      }
    }
    return 0;
  });
}

export function buildDefaultViewConfig(properties: PropertyDefinition[]): ViewConfig {
  return {
    visibleProperties: properties.map((p) => p.id),
  };
}
