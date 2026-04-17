import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  blocks,
  databaseViews,
  databaseTemplates,
  type BlockType,
  type ViewType as DbViewType,
} from '../../../../slack/src/lib/db/schema';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import type { AppVariables } from '../types/app.js';
import type {
  PropertyDefinition,
  PropertyValue,
  PropertyType,
  DatabaseSchema,
  DatabaseBlockProperties,
  DatabaseRowProperties,
  FilterGroup,
  FilterCondition,
  SortRule,
  ViewConfig,
  ViewType,
  DateValue,
  FormulaConfig,
  RelationConfig,
  RollupConfig,
  FormulaResult,
  RollupResult,
} from '@notion/shared';
import { AUTO_PROPERTIES, parseFormula, evaluateFormula } from '@notion/shared';
import { checkAutomations, checkAutomationsOnCreate } from '../lib/automation-engine.js';

const databases = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// ============================================================
// Zod Schemas
// ============================================================

const SelectOptionSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  color: z.string().default('default'),
});

const StatusGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  optionIds: z.array(z.string()),
});

const PropertyDefinitionSchema = z.object({
  name: z.string(),
  type: z.enum([
    'title', 'text', 'number', 'select', 'multi_select', 'date', 'person',
    'files', 'checkbox', 'url', 'email', 'phone', 'status',
    'formula', 'relation', 'rollup',
    'created_time', 'created_by', 'last_edited_time', 'last_edited_by',
  ] as [PropertyType, ...PropertyType[]]),
  options: z.array(SelectOptionSchema).optional(),
  numberFormat: z.enum(['number', 'number_with_commas', 'percent', 'dollar', 'euro', 'won', 'yen']).optional(),
  statusGroups: z.array(StatusGroupSchema).optional(),
  formula: z.object({ expression: z.string() }).optional(),
  relation: z.object({
    relatedDatabaseId: z.string(),
    reversePropertyId: z.string().optional(),
  }).optional(),
  rollup: z.object({
    relationPropertyId: z.string(),
    targetPropertyId: z.string(),
    function: z.enum(['count', 'count_values', 'sum', 'avg', 'min', 'max', 'median', 'range', 'percent_empty', 'percent_not_empty', 'show_original', 'show_unique']),
  }).optional(),
});

const CreateDatabaseSchema = z.object({
  title: z.string().default('Untitled'),
  parentId: z.string().optional(),
  workspaceId: z.string(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  schema: z.object({
    properties: z.array(PropertyDefinitionSchema).optional().default([]),
  }).optional().default({ properties: [] }),
});

const UpdateDatabaseSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  archived: z.boolean().optional(),
});

const FormulaConfigSchema = z.object({ expression: z.string() });
const RelationConfigSchema = z.object({
  relatedDatabaseId: z.string(),
  reversePropertyId: z.string().optional(),
});
const RollupConfigSchema = z.object({
  relationPropertyId: z.string(),
  targetPropertyId: z.string(),
  function: z.enum(['count', 'count_values', 'sum', 'avg', 'min', 'max', 'median', 'range', 'percent_empty', 'percent_not_empty', 'show_original', 'show_unique']),
});

const PROPERTY_TYPE_ENUM = z.enum([
  'title', 'text', 'number', 'select', 'multi_select', 'date', 'person',
  'files', 'checkbox', 'url', 'email', 'phone', 'status',
  'formula', 'relation', 'rollup',
  'created_time', 'created_by', 'last_edited_time', 'last_edited_by',
] as [PropertyType, ...PropertyType[]]);

const AddPropertySchema = z.object({
  name: z.string(),
  type: PROPERTY_TYPE_ENUM,
  options: z.array(SelectOptionSchema).optional(),
  numberFormat: z.enum(['number', 'number_with_commas', 'percent', 'dollar', 'euro', 'won', 'yen']).optional(),
  statusGroups: z.array(StatusGroupSchema).optional(),
  formula: FormulaConfigSchema.optional(),
  relation: RelationConfigSchema.optional(),
  rollup: RollupConfigSchema.optional(),
});

const UpdatePropertySchema = z.object({
  name: z.string().optional(),
  type: PROPERTY_TYPE_ENUM.optional(),
  options: z.array(SelectOptionSchema).optional(),
  numberFormat: z.enum(['number', 'number_with_commas', 'percent', 'dollar', 'euro', 'won', 'yen']).optional(),
  statusGroups: z.array(StatusGroupSchema).optional(),
  formula: FormulaConfigSchema.optional(),
  relation: RelationConfigSchema.optional(),
  rollup: RollupConfigSchema.optional(),
});

const PropertyValueSchema: z.ZodType<PropertyValue> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), value: z.string() }),
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({ type: z.literal('number'), value: z.number().nullable() }),
  z.object({ type: z.literal('select'), value: z.string().nullable() }),
  z.object({ type: z.literal('multi_select'), value: z.array(z.string()) }),
  z.object({ type: z.literal('date'), value: z.object({ start: z.string(), end: z.string().optional(), includeTime: z.boolean().optional() }).nullable() }),
  z.object({ type: z.literal('person'), value: z.array(z.string()) }),
  z.object({ type: z.literal('files'), value: z.array(z.object({ name: z.string(), url: z.string(), size: z.number().optional() })) }),
  z.object({ type: z.literal('checkbox'), value: z.boolean() }),
  z.object({ type: z.literal('url'), value: z.string() }),
  z.object({ type: z.literal('email'), value: z.string() }),
  z.object({ type: z.literal('phone'), value: z.string() }),
  z.object({ type: z.literal('status'), value: z.string().nullable() }),
  z.object({ type: z.literal('relation'), value: z.array(z.string()) }),
  z.object({ type: z.literal('created_time'), value: z.string() }),
  z.object({ type: z.literal('created_by'), value: z.string() }),
  z.object({ type: z.literal('last_edited_time'), value: z.string() }),
  z.object({ type: z.literal('last_edited_by'), value: z.string() }),
]);

const CreateRowSchema = z.object({
  values: z.record(z.string(), PropertyValueSchema).optional().default({}),
  parentRowId: z.string().optional(),
});

const UpdateRowSchema = z.object({
  values: z.record(z.string(), PropertyValueSchema),
  parentRowId: z.string().optional().nullable(),
});

const FilterConditionSchema: z.ZodType<FilterCondition> = z.object({
  propertyId: z.string(),
  operator: z.enum([
    'equals', 'does_not_equal', 'contains', 'does_not_contain',
    'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
    'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal',
    'before', 'after', 'on_or_before', 'on_or_after',
    'is_checked', 'is_not_checked',
  ]),
  value: z.unknown().optional(),
});

const FilterGroupSchema: z.ZodType<FilterGroup> = z.object({
  logic: z.enum(['and', 'or']),
  conditions: z.array(FilterConditionSchema),
});

const SortRuleSchema: z.ZodType<SortRule> = z.object({
  propertyId: z.string(),
  direction: z.enum(['ascending', 'descending']),
});

const ViewConfigSchema: z.ZodType<ViewConfig> = z.object({
  visibleProperties: z.array(z.string()),
  columnWidths: z.record(z.string(), z.number()).optional(),
  boardGroupBy: z.string().optional(),
  calendarDateProperty: z.string().optional(),
  galleryCoverProperty: z.string().optional(),
  galleryCardSize: z.enum(['small', 'medium', 'large']).optional(),
  timelineStartProperty: z.string().optional(),
  timelineEndProperty: z.string().optional(),
  timelineZoom: z.enum(['day', 'week', 'month']).optional(),
});

const CreateViewSchema = z.object({
  name: z.string(),
  type: z.enum(['table', 'board', 'list', 'calendar', 'gallery', 'timeline'] as [ViewType, ...ViewType[]]),
  config: ViewConfigSchema.optional(),
});

const UpdateViewSchema = z.object({
  name: z.string().optional(),
  filters: FilterGroupSchema.optional(),
  sorts: z.array(SortRuleSchema).optional(),
  groupBy: z.object({ propertyId: z.string(), hidden: z.array(z.string()).optional() }).optional().nullable(),
  config: ViewConfigSchema.optional(),
});

// ============================================================
// Formula / Rollup / Relation helpers
// ============================================================

function computeFormula(
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

async function computeRollup(
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
      case 'count': return { type: 'number', value: relatedRows.length };
      case 'count_values': return { type: 'number', value: values.filter((v) => !isEmpty(v)).length };
      case 'sum': return { type: 'number', value: numValues.reduce((a, b) => a + b, 0) };
      case 'avg': return { type: 'number', value: numValues.length > 0 ? numValues.reduce((a, b) => a + b, 0) / numValues.length : 0 };
      case 'min': return { type: 'number', value: numValues.length > 0 ? Math.min(...numValues) : 0 };
      case 'max': return { type: 'number', value: numValues.length > 0 ? Math.max(...numValues) : 0 };
      case 'median': {
        const sorted = [...numValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const med = sorted.length === 0 ? 0
          : sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
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
        return { type: 'number', value: (values.filter((v) => !isEmpty(v)).length / values.length) * 100 };
      }
      case 'show_original': return { type: 'array', value: values };
      case 'show_unique': {
        const seen = new Set<string>();
        const unique: unknown[] = [];
        for (const v of values) {
          const key = JSON.stringify(v);
          if (!seen.has(key)) { seen.add(key); unique.push(v); }
        }
        return { type: 'array', value: unique };
      }
      default: return { type: 'error', value: `Unknown rollup function '${fn}'` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', value: message };
  }
}

/** Sync reverse relation: ensure rowB's reversePropertyId includes rowAId */
async function syncReverseRelation(
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

async function enrichRowWithComputedValues(
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

// ============================================================
// Filtering & Sorting helpers
// ============================================================

function evaluateCondition(condition: FilterCondition, rowProps: DatabaseRowProperties, schema: DatabaseSchema): boolean {
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

function applyFilters(
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

function applySorts(
  rows: Array<{ id: string; properties: unknown; createdAt: Date }>,
  sorts: SortRule[],
  schema: DatabaseSchema,
): Array<{ id: string; properties: unknown; createdAt: Date }> {
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

function buildDefaultViewConfig(properties: PropertyDefinition[]): ViewConfig {
  return {
    visibleProperties: properties.map((p) => p.id),
  };
}

// ============================================================
// Database CRUD
// ============================================================

databases.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateDatabaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const { title, parentId, workspaceId, icon, coverUrl, schema } = parsed.data;

  const titleProp: PropertyDefinition = {
    id: randomUUID(),
    name: 'Name',
    type: 'title',
  };

  // Filter out any title-type properties from the schema — we always add exactly one "Name" title
  const extraProps: PropertyDefinition[] = (schema.properties ?? [])
    .filter((p) => p.type !== 'title')
    .map((p) => ({
    id: randomUUID(),
    name: p.name,
    type: p.type,
    ...(p.options ? { options: p.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color })) } : {}),
    ...(p.numberFormat ? { numberFormat: p.numberFormat } : {}),
    ...(p.statusGroups ? { statusGroups: p.statusGroups } : {}),
  }));

  const allProperties: PropertyDefinition[] = [titleProp, ...extraProps];
  const dbSchema: DatabaseSchema = { properties: allProperties };

  const dbProperties: DatabaseBlockProperties = {
    title,
    icon: icon ?? null,
    coverUrl: coverUrl ?? null,
    schema: dbSchema,
  };

  const dbBlock = await db
    .insert(blocks)
    .values({
      type: 'database',
      parentId: parentId ?? null,
      pageId: workspaceId, // placeholder, updated below
      workspaceId,
      createdBy: user.id,
      properties: dbProperties as unknown as Record<string, unknown>,
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  const updatedBlock = await db
    .update(blocks)
    .set({ pageId: dbBlock.id })
    .where(eq(blocks.id, dbBlock.id))
    .returning()
    .then((r) => r[0]!);

  if (parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, dbBlock.id] })
          .where(eq(blocks.id, parentId));
      }
    });
  }

  const defaultViewConfig = buildDefaultViewConfig(allProperties);
  const view = await db
    .insert(databaseViews)
    .values({
      databaseId: dbBlock.id,
      name: 'Default View',
      type: 'table' as DbViewType,
      filters: { logic: 'and', conditions: [] },
      sorts: [],
      config: defaultViewConfig,
      position: 0,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json({ ...updatedBlock, properties: updatedBlock.properties, view }, 201);
});

// GET /:databaseId
databases.get('/:databaseId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const views = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(asc(databaseViews.position));

  return c.json({ ...dbBlock, views });
});

// PATCH /:databaseId
databases.patch('/:databaseId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdateDatabaseSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const props = existing.properties as unknown as DatabaseBlockProperties;
  const updatedProps: DatabaseBlockProperties = { ...props };
  if (parsed.data.title !== undefined) updatedProps.title = parsed.data.title;
  if (parsed.data.icon !== undefined) updatedProps.icon = parsed.data.icon;
  if (parsed.data.coverUrl !== undefined) updatedProps.coverUrl = parsed.data.coverUrl;

  const dbBlock = await db
    .update(blocks)
    .set({
      properties: updatedProps as unknown as Record<string, unknown>,
      archived: parsed.data.archived ?? existing.archived,
      updatedAt: new Date(),
    })
    .where(eq(blocks.id, databaseId))
    .returning()
    .then((r) => r[0]!);

  return c.json({ ...dbBlock });
});

// DELETE /:databaseId
databases.delete('/:databaseId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);

  await db
    .update(blocks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocks.id, databaseId));

  if (existing.parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, existing.parentId!))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: parent.childrenOrder.filter((id) => id !== databaseId) })
          .where(eq(blocks.id, existing.parentId!));
      }
    });
  }

  return c.json({ object: 'database', id: databaseId, archived: true });
});

// ============================================================
// Property Management
// ============================================================

databases.post('/:databaseId/properties', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();
  const body = await c.req.json();
  const parsed = AddPropertySchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const props = existing.properties as unknown as DatabaseBlockProperties;

  // Guard: prevent adding a second title property
  if (parsed.data.type === 'title') {
    return c.json({ object: 'error', status: 400, code: 'cannot_add_title', message: 'A database can only have one title property' }, 400);
  }

  const newPropId = randomUUID();

  const newProp: PropertyDefinition = {
    id: newPropId,
    name: parsed.data.name,
    type: parsed.data.type,
    ...(parsed.data.options ? { options: parsed.data.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color })) } : {}),
    ...(parsed.data.numberFormat ? { numberFormat: parsed.data.numberFormat } : {}),
    ...(parsed.data.statusGroups ? { statusGroups: parsed.data.statusGroups } : {}),
    ...(parsed.data.formula ? { formula: parsed.data.formula as FormulaConfig } : {}),
    ...(parsed.data.rollup ? { rollup: parsed.data.rollup as RollupConfig } : {}),
  };

  if (parsed.data.type === 'relation' && parsed.data.relation) {
    const { relatedDatabaseId, reversePropertyId: existingReverseId } = parsed.data.relation;

    const relatedDb = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.id, relatedDatabaseId), eq(blocks.type, 'database')))
      .limit(1)
      .then((r) => r[0]);
    if (!relatedDb || relatedDb.archived) {
      return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'Related database not found' }, 400);
    }

    const relatedProps = relatedDb.properties as unknown as DatabaseBlockProperties;
    const reverseId = existingReverseId ?? randomUUID();

    const reverseProp: PropertyDefinition = {
      id: reverseId,
      name: `${props.title} (reverse)`,
      type: 'relation',
      relation: {
        relatedDatabaseId: databaseId,
        reversePropertyId: newPropId,
      },
    };

    const updatedRelatedSchema: DatabaseSchema = {
      properties: [...relatedProps.schema.properties, reverseProp],
    };

    await db
      .update(blocks)
      .set({
        properties: { ...relatedProps, schema: updatedRelatedSchema } as unknown as Record<string, unknown>,
      })
      .where(eq(blocks.id, relatedDatabaseId));

    newProp.relation = {
      relatedDatabaseId,
      reversePropertyId: reverseId,
    };
  } else if (parsed.data.relation) {
    newProp.relation = parsed.data.relation as RelationConfig;
  }

  const updatedSchema: DatabaseSchema = {
    properties: [...props.schema.properties, newProp],
  };

  await db
    .update(blocks)
    .set({
      properties: { ...props, schema: updatedSchema } as unknown as Record<string, unknown>,
    })
    .where(eq(blocks.id, databaseId));

  return c.json({ property: newProp, schema: updatedSchema }, 201);
});

databases.patch('/:databaseId/properties/:propertyId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, propertyId } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdatePropertySchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const props = existing.properties as unknown as DatabaseBlockProperties;
  const propIndex = props.schema.properties.findIndex((p) => p.id === propertyId);
  if (propIndex === -1) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Property not found' }, 404);
  }

  const existingProp = props.schema.properties[propIndex]!;

  // Guard: prevent changing a non-title property into a title (would create duplicate)
  if (parsed.data.type === 'title' && existingProp.type !== 'title') {
    return c.json({ object: 'error', status: 400, code: 'cannot_convert_to_title', message: 'Cannot convert a property to type title' }, 400);
  }

  const updatedProp: PropertyDefinition = {
    ...existingProp,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
    ...(parsed.data.options !== undefined ? { options: parsed.data.options.map((o) => ({ id: o.id ?? randomUUID(), name: o.name, color: o.color })) } : {}),
    ...(parsed.data.numberFormat !== undefined ? { numberFormat: parsed.data.numberFormat } : {}),
    ...(parsed.data.statusGroups !== undefined ? { statusGroups: parsed.data.statusGroups } : {}),
    ...(parsed.data.formula !== undefined ? { formula: parsed.data.formula as FormulaConfig } : {}),
    ...(parsed.data.relation !== undefined ? { relation: parsed.data.relation as RelationConfig } : {}),
    ...(parsed.data.rollup !== undefined ? { rollup: parsed.data.rollup as RollupConfig } : {}),
  };

  const updatedProperties = [...props.schema.properties];
  updatedProperties[propIndex] = updatedProp;
  const updatedSchema: DatabaseSchema = { properties: updatedProperties };

  await db
    .update(blocks)
    .set({
      properties: { ...props, schema: updatedSchema } as unknown as Record<string, unknown>,
    })
    .where(eq(blocks.id, databaseId));

  return c.json({ property: updatedProp, schema: updatedSchema });
});

databases.delete('/:databaseId/properties/:propertyId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, propertyId } = c.req.param();

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const props = existing.properties as unknown as DatabaseBlockProperties;
  const propToDelete = props.schema.properties.find((p) => p.id === propertyId);
  if (!propToDelete) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Property not found' }, 404);
  }

  if (propToDelete.type === 'title') {
    return c.json({ object: 'error', status: 400, code: 'cannot_delete_title', message: 'The title property cannot be deleted' }, 400);
  }

  if (propToDelete.type === 'relation' && propToDelete.relation?.relatedDatabaseId && propToDelete.relation.reversePropertyId) {
    const { relatedDatabaseId, reversePropertyId } = propToDelete.relation;
    const relatedDb = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.id, relatedDatabaseId), eq(blocks.type, 'database')))
      .limit(1)
      .then((r) => r[0]);
    if (relatedDb && !relatedDb.archived) {
      const relatedProps = relatedDb.properties as unknown as DatabaseBlockProperties;
      const filteredRelatedSchema: DatabaseSchema = {
        properties: relatedProps.schema.properties.filter((p) => p.id !== reversePropertyId),
      };
      await db
        .update(blocks)
        .set({
          properties: { ...relatedProps, schema: filteredRelatedSchema } as unknown as Record<string, unknown>,
        })
        .where(eq(blocks.id, relatedDatabaseId));
    }
  }

  const updatedSchema: DatabaseSchema = {
    properties: props.schema.properties.filter((p) => p.id !== propertyId),
  };

  await db
    .update(blocks)
    .set({
      properties: { ...props, schema: updatedSchema } as unknown as Record<string, unknown>,
    })
    .where(eq(blocks.id, databaseId));

  return c.json({ object: 'property', id: propertyId, deleted: true });
});

// ============================================================
// Row CRUD
// ============================================================

databases.get('/:databaseId/rows', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();
  const viewId = c.req.query('view_id');
  const cursorParam = c.req.query('start_cursor') ?? c.req.query('cursor');
  const cursor = cursorParam ? (() => { try { return decodeCursor(cursorParam); } catch { return cursorParam; } })() : undefined;
  const pageSize = Math.min(Number(c.req.query('page_size') ?? 50), 100);
  const parentRowId = c.req.query('parent_row_id');
  const includeSubItems = c.req.query('include_sub_items') === 'true';

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);

  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;

  let filterGroup: FilterGroup = { logic: 'and', conditions: [] };
  let sorts: SortRule[] = [];
  if (viewId) {
    const view = await db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, viewId))
      .limit(1)
      .then((r) => r[0]);
    if (view) {
      filterGroup = view.filters as unknown as FilterGroup;
      sorts = view.sorts as unknown as SortRule[];
    }
  }

  const allRows = await db
    .select()
    .from(blocks)
    .where(
      and(
        eq(blocks.parentId, databaseId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
      ),
    )
    .orderBy(asc(blocks.createdAt));

  const rowsForParent = parentRowId !== undefined
    ? allRows.filter((r) => {
        const rp = r.properties as unknown as DatabaseRowProperties;
        const storedParent = (rp.values as Record<string, unknown>)?.['__parentRowId'];
        return storedParent === parentRowId;
      })
    : allRows.filter((r) => {
        const rp = r.properties as unknown as DatabaseRowProperties;
        const storedParent = (rp.values as Record<string, unknown>)?.['__parentRowId'];
        return storedParent === undefined || storedParent === null;
      });

  const filtered = applyFilters(rowsForParent, filterGroup, schema);

  const sorted = applySorts(
    filtered as Array<{ id: string; properties: unknown; createdAt: Date }>,
    sorts,
    schema,
  );

  let startIndex = 0;
  if (cursor) {
    const idx = sorted.findIndex((r) => r.id === cursor);
    if (idx !== -1) startIndex = idx + 1;
  }
  const pageRows = sorted.slice(startIndex, startIndex + pageSize);
  const hasMore = pageRows.length === pageSize && startIndex + pageSize < sorted.length;
  const nextCursor = hasMore && pageRows[pageRows.length - 1]
    ? encodeCursor(pageRows[pageRows.length - 1]!.id)
    : null;

  const enriched = await Promise.all(
    pageRows.map((row) => enrichRowWithComputedValues(row, schema)),
  );

  type RowWithSubItems = typeof enriched[number] & { subItems?: typeof enriched; parentRowId?: string | null };
  let results: RowWithSubItems[];
  if (includeSubItems) {
    const pageIds = enriched.map((r) => r.id);
    const allSubRows = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.parentId, databaseId),
          eq(blocks.type, 'page'),
          eq(blocks.archived, false),
        ),
      )
      .orderBy(asc(blocks.createdAt));

    const subRowsByParent = new Map<string, typeof allSubRows>();
    for (const sub of allSubRows) {
      const rp = sub.properties as unknown as DatabaseRowProperties;
      const subParentId = (rp.values as Record<string, unknown>)?.['__parentRowId'];
      if (typeof subParentId === 'string' && pageIds.includes(subParentId)) {
        const list = subRowsByParent.get(subParentId) ?? [];
        list.push(sub);
        subRowsByParent.set(subParentId, list);
      }
    }

    results = await Promise.all(
      enriched.map(async (row): Promise<RowWithSubItems> => {
        const subRaw = subRowsByParent.get(row.id) ?? [];
        const subEnriched = await Promise.all(subRaw.map((s) => enrichRowWithComputedValues(s, schema)));
        const rp = row.properties as DatabaseRowProperties;
        const pid = (rp.values as Record<string, unknown>)?.['__parentRowId'] ?? null;
        return { ...row, subItems: subEnriched, parentRowId: pid as string | null };
      }),
    );
  } else {
    results = enriched.map((row) => {
      const rp = row.properties as DatabaseRowProperties;
      const pid = (rp.values as Record<string, unknown>)?.['__parentRowId'] ?? null;
      return { ...row, parentRowId: pid as string | null };
    });
  }

  return c.json({
    object: 'list',
    results,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
});

databases.post('/:databaseId/rows', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();
  const body = await c.req.json();
  const parsed = CreateRowSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const now = new Date().toISOString();

  const clientValues = parsed.data.values;
  for (const [, val] of Object.entries(clientValues)) {
    if (AUTO_PROPERTIES.includes(val.type as typeof AUTO_PROPERTIES[number])) {
      return c.json({ object: 'error', status: 400, code: 'validation_error', message: `Property type '${val.type}' is auto-computed and cannot be set by clients` }, 400);
    }
  }

  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;

  if (parsed.data.parentRowId) {
    const parentRow = await db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.id, parsed.data.parentRowId),
          eq(blocks.parentId, databaseId),
          eq(blocks.type, 'page'),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
    if (!parentRow || parentRow.archived) {
      return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'Parent row not found in this database' }, 400);
    }
  }

  for (const [propId, val] of Object.entries(clientValues)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.relatedDatabaseId) {
        const relatedIds = val.value as string[];
        if (relatedIds.length > 0) {
          const found = await db
            .select({ id: blocks.id })
            .from(blocks)
            .where(
              and(
                inArray(blocks.id, relatedIds),
                eq(blocks.parentId, propDef.relation.relatedDatabaseId),
                eq(blocks.archived, false),
              ),
            );
          if (found.length !== relatedIds.length) {
            return c.json({ object: 'error', status: 400, code: 'validation_error', message: `Some relation row ids do not exist in the related database` }, 400);
          }
        }
      }
    }
  }

  const autoValues: Record<string, PropertyValue> = {};
  for (const prop of schema.properties) {
    if (prop.type === 'created_time') {
      autoValues[prop.id] = { type: 'created_time', value: now };
    } else if (prop.type === 'created_by') {
      autoValues[prop.id] = { type: 'created_by', value: user.id };
    } else if (prop.type === 'last_edited_time') {
      autoValues[prop.id] = { type: 'last_edited_time', value: now };
    } else if (prop.type === 'last_edited_by') {
      autoValues[prop.id] = { type: 'last_edited_by', value: user.id };
    }
  }

  const parentRowValue: Record<string, unknown> = parsed.data.parentRowId
    ? { __parentRowId: parsed.data.parentRowId }
    : {};

  const rowProperties: DatabaseRowProperties = {
    values: { ...autoValues, ...clientValues, ...parentRowValue } as Record<string, PropertyValue>,
  };

  const row = await db
    .insert(blocks)
    .values({
      type: 'page' as BlockType,
      parentId: databaseId,
      pageId: databaseId, // placeholder, self-updated below
      workspaceId: dbBlock.workspaceId,
      createdBy: user.id,
      properties: rowProperties as unknown as Record<string, unknown>,
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  const updatedRow = await db
    .update(blocks)
    .set({ pageId: row.id })
    .where(eq(blocks.id, row.id))
    .returning()
    .then((r) => r[0]!);

  await db.transaction(async (tx) => {
    const currentDb = await tx
      .select({ childrenOrder: blocks.childrenOrder })
      .from(blocks)
      .where(eq(blocks.id, databaseId))
      .limit(1)
      .then((r) => r[0]);
    if (currentDb) {
      await tx
        .update(blocks)
        .set({ childrenOrder: [...currentDb.childrenOrder, row.id] })
        .where(eq(blocks.id, databaseId));
    }
  });

  for (const [propId, val] of Object.entries(clientValues)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.reversePropertyId) {
        const relatedIds = val.value as string[];
        await Promise.all(
          relatedIds.map((relId) =>
            syncReverseRelation(updatedRow.id, relId, propDef.relation!.reversePropertyId!, true),
          ),
        );
      }
    }
  }

  checkAutomationsOnCreate(databaseId, updatedRow.id).catch(() => {});

  return c.json({ ...updatedRow, parentRowId: parsed.data.parentRowId ?? null }, 201);
});

databases.patch('/:databaseId/rows/:rowId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, rowId } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdateRowSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const row = await db
    .select()
    .from(blocks)
    .where(
      and(
        eq(blocks.id, rowId),
        eq(blocks.parentId, databaseId),
        eq(blocks.type, 'page'),
      ),
    )
    .limit(1)
    .then((r) => r[0]);
  if (!row || row.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Row not found' }, 404);
  }

  for (const [, val] of Object.entries(parsed.data.values)) {
    if (AUTO_PROPERTIES.includes(val.type as typeof AUTO_PROPERTIES[number])) {
      return c.json({ object: 'error', status: 400, code: 'validation_error', message: `Property type '${val.type}' is auto-computed and cannot be set by clients` }, 400);
    }
  }

  const now = new Date().toISOString();
  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;
  const existingRowProps = row.properties as unknown as DatabaseRowProperties;

  for (const [propId, val] of Object.entries(parsed.data.values)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.relatedDatabaseId) {
        const relatedIds = val.value as string[];
        if (relatedIds.length > 0) {
          const found = await db
            .select({ id: blocks.id })
            .from(blocks)
            .where(
              and(
                inArray(blocks.id, relatedIds),
                eq(blocks.parentId, propDef.relation.relatedDatabaseId),
                eq(blocks.archived, false),
              ),
            );
          if (found.length !== relatedIds.length) {
            return c.json({ object: 'error', status: 400, code: 'validation_error', message: `Some relation row ids do not exist in the related database` }, 400);
          }
        }
      }
    }
  }

  const autoUpdates: Record<string, PropertyValue> = {};
  for (const prop of schema.properties) {
    if (prop.type === 'last_edited_time') {
      autoUpdates[prop.id] = { type: 'last_edited_time', value: now };
    } else if (prop.type === 'last_edited_by') {
      autoUpdates[prop.id] = { type: 'last_edited_by', value: user.id };
    }
  }

  const parentRowUpdate: Record<string, unknown> = {};
  if (parsed.data.parentRowId !== undefined) {
    if (parsed.data.parentRowId === null) {
      const existingValues = { ...existingRowProps.values } as Record<string, unknown>;
      delete existingValues['__parentRowId'];
      const mergedValues = { ...existingValues, ...autoUpdates, ...parsed.data.values } as Record<string, PropertyValue>;
      const updatedRow = await db
        .update(blocks)
        .set({ properties: { values: mergedValues } as Record<string, unknown> })
        .where(eq(blocks.id, rowId))
        .returning()
        .then((r) => r[0]!);
      checkAutomations(databaseId, rowId, Object.fromEntries(
        Object.entries(parsed.data.values).map(([propId, newVal]) => [
          propId,
          { oldValue: existingRowProps.values?.[propId], newValue: newVal },
        ]),
      )).catch(() => {});
      return c.json({ ...updatedRow, parentRowId: null });
    } else {
      const parentRow = await db
        .select()
        .from(blocks)
        .where(
          and(
            eq(blocks.id, parsed.data.parentRowId),
            eq(blocks.parentId, databaseId),
            eq(blocks.type, 'page'),
          ),
        )
        .limit(1)
        .then((r) => r[0]);
      if (!parentRow || parentRow.archived) {
        return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'Parent row not found in this database' }, 400);
      }
      parentRowUpdate['__parentRowId'] = parsed.data.parentRowId;
    }
  }

  const mergedValues: Record<string, PropertyValue> = {
    ...existingRowProps.values,
    ...autoUpdates,
    ...parsed.data.values,
    ...parentRowUpdate,
  } as Record<string, PropertyValue>;

  const updatedRow = await db
    .update(blocks)
    .set({
      properties: { values: mergedValues } as Record<string, unknown>,
    })
    .where(eq(blocks.id, rowId))
    .returning()
    .then((r) => r[0]!);

  for (const [propId, val] of Object.entries(parsed.data.values)) {
    if (val.type === 'relation') {
      const propDef = schema.properties.find((p) => p.id === propId);
      if (propDef?.type === 'relation' && propDef.relation?.reversePropertyId) {
        const newIds = val.value as string[];
        const oldVal = existingRowProps.values?.[propId];
        const oldIds: string[] = oldVal?.type === 'relation' ? (oldVal.value as string[]) : [];

        const removed = oldIds.filter((id) => !newIds.includes(id));
        const added = newIds.filter((id) => !oldIds.includes(id));

        await Promise.all([
          ...removed.map((relId) =>
            syncReverseRelation(rowId, relId, propDef.relation!.reversePropertyId!, false),
          ),
          ...added.map((relId) =>
            syncReverseRelation(rowId, relId, propDef.relation!.reversePropertyId!, true),
          ),
        ]);
      }
    }
  }

  const storedParentId = (mergedValues as Record<string, unknown>)['__parentRowId'] ?? null;

  checkAutomations(databaseId, rowId, Object.fromEntries(
    Object.entries(parsed.data.values).map(([propId, newVal]) => [
      propId,
      {
        oldValue: existingRowProps.values?.[propId],
        newValue: newVal,
      },
    ]),
  )).catch(() => {});

  return c.json({ ...updatedRow, parentRowId: storedParentId });
});

databases.delete('/:databaseId/rows/:rowId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, rowId } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const row = await db
    .select()
    .from(blocks)
    .where(
      and(
        eq(blocks.id, rowId),
        eq(blocks.parentId, databaseId),
        eq(blocks.type, 'page'),
      ),
    )
    .limit(1)
    .then((r) => r[0]);
  if (!row) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Row not found' }, 404);
  }

  await db
    .update(blocks)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(blocks.id, rowId));

  await db.transaction(async (tx) => {
    const currentDb = await tx
      .select({ childrenOrder: blocks.childrenOrder })
      .from(blocks)
      .where(eq(blocks.id, databaseId))
      .limit(1)
      .then((r) => r[0]);
    if (currentDb) {
      await tx
        .update(blocks)
        .set({ childrenOrder: currentDb.childrenOrder.filter((id) => id !== rowId) })
        .where(eq(blocks.id, databaseId));
    }
  });

  return c.json({ object: 'row', id: rowId, archived: true });
});

// ============================================================
// View Management
// ============================================================

databases.get('/:databaseId/views', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const views = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(asc(databaseViews.position));

  return c.json({ object: 'list', results: views });
});

databases.post('/:databaseId/views', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();
  const body = await c.req.json();
  const parsed = CreateViewSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const maxView = await db
    .select({ position: databaseViews.position })
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(desc(databaseViews.position))
    .limit(1)
    .then((r) => r[0]);
  const nextPosition = (maxView?.position ?? -1) + 1;

  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;
  const defaultConfig = parsed.data.config ?? buildDefaultViewConfig(schema.properties);

  const view = await db
    .insert(databaseViews)
    .values({
      databaseId,
      name: parsed.data.name,
      type: parsed.data.type as DbViewType,
      filters: { logic: 'and', conditions: [] },
      sorts: [],
      config: defaultConfig,
      position: nextPosition,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(view, 201);
});

databases.patch('/:databaseId/views/:viewId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, viewId } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdateViewSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const existingView = await db
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.id, viewId), eq(databaseViews.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existingView) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'View not found' }, 404);
  }

  const updates: Partial<typeof databaseViews.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.filters !== undefined) updates.filters = parsed.data.filters;
  if (parsed.data.sorts !== undefined) updates.sorts = parsed.data.sorts;
  if (parsed.data.groupBy !== undefined) updates.groupBy = parsed.data.groupBy;
  if (parsed.data.config !== undefined) updates.config = parsed.data.config;

  const updatedView = await db
    .update(databaseViews)
    .set(updates)
    .where(eq(databaseViews.id, viewId))
    .returning()
    .then((r) => r[0]!);

  return c.json(updatedView);
});

databases.delete('/:databaseId/views/:viewId', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, viewId } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const existingView = await db
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.id, viewId), eq(databaseViews.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existingView) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'View not found' }, 404);
  }

  await db.delete(databaseViews).where(eq(databaseViews.id, viewId));

  return c.json({ object: 'view', id: viewId, deleted: true });
});

// ============================================================
// Template Management
// ============================================================

const CreateTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  content: z.array(z.object({
    type: z.string(),
    properties: z.record(z.string(), z.unknown()),
    content: z.record(z.string(), z.unknown()),
    children: z.array(z.unknown()).optional(),
  })).optional().default([]),
  values: z.record(z.string(), PropertyValueSchema).optional().default({}),
  isDefault: z.boolean().optional().default(false),
});

const UpdateTemplateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  content: z.array(z.object({
    type: z.string(),
    properties: z.record(z.string(), z.unknown()),
    content: z.record(z.string(), z.unknown()),
    children: z.array(z.unknown()).optional(),
  })).optional(),
  values: z.record(z.string(), PropertyValueSchema).optional(),
  isDefault: z.boolean().optional(),
});

databases.get('/:databaseId/templates', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const templates = await db
    .select()
    .from(databaseTemplates)
    .where(eq(databaseTemplates.databaseId, databaseId))
    .orderBy(asc(databaseTemplates.position));

  return c.json({ object: 'list', results: templates });
});

databases.post('/:databaseId/templates', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId } = c.req.param();
  const body = await c.req.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const maxTemplate = await db
    .select({ position: databaseTemplates.position })
    .from(databaseTemplates)
    .where(eq(databaseTemplates.databaseId, databaseId))
    .orderBy(desc(databaseTemplates.position))
    .limit(1)
    .then((r) => r[0]);
  const nextPosition = (maxTemplate?.position ?? -1) + 1;

  const template = await db
    .insert(databaseTemplates)
    .values({
      databaseId,
      name: parsed.data.name,
      description: parsed.data.description,
      icon: parsed.data.icon,
      content: parsed.data.content as unknown[],
      values: parsed.data.values as Record<string, unknown>,
      isDefault: parsed.data.isDefault,
      position: nextPosition,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(template, 201);
});

databases.patch('/:databaseId/templates/:tid', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, tid } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const existing = await db
    .select()
    .from(databaseTemplates)
    .where(and(eq(databaseTemplates.id, tid), eq(databaseTemplates.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);
  }

  const updates: Partial<typeof databaseTemplates.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content as unknown[];
  if (parsed.data.values !== undefined) updates.values = parsed.data.values as Record<string, unknown>;
  if (parsed.data.isDefault !== undefined) updates.isDefault = parsed.data.isDefault;

  const updated = await db
    .update(databaseTemplates)
    .set(updates)
    .where(eq(databaseTemplates.id, tid))
    .returning()
    .then((r) => r[0]);

  return c.json(updated);
});

databases.delete('/:databaseId/templates/:tid', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, tid } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const existing = await db
    .select()
    .from(databaseTemplates)
    .where(and(eq(databaseTemplates.id, tid), eq(databaseTemplates.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);
  }

  await db.delete(databaseTemplates).where(eq(databaseTemplates.id, tid));

  return c.json({ object: 'template', id: tid, deleted: true });
});

// POST /:databaseId/rows/from-template/:tid
databases.post('/:databaseId/rows/from-template/:tid', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { databaseId, tid } = c.req.param();

  const dbBlock = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, databaseId), eq(blocks.type, 'database')))
    .limit(1)
    .then((r) => r[0]);
  if (!dbBlock || dbBlock.archived) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Database not found' }, 404);
  }

  const template = await db
    .select()
    .from(databaseTemplates)
    .where(and(eq(databaseTemplates.id, tid), eq(databaseTemplates.databaseId, databaseId)))
    .limit(1)
    .then((r) => r[0]);
  if (!template) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);
  }

  const now = new Date().toISOString();
  const schema = (dbBlock.properties as unknown as DatabaseBlockProperties).schema;

  const autoValues: Record<string, PropertyValue> = {};
  for (const prop of schema.properties) {
    if (prop.type === 'created_time') {
      autoValues[prop.id] = { type: 'created_time', value: now };
    } else if (prop.type === 'created_by') {
      autoValues[prop.id] = { type: 'created_by', value: user.id };
    } else if (prop.type === 'last_edited_time') {
      autoValues[prop.id] = { type: 'last_edited_time', value: now };
    } else if (prop.type === 'last_edited_by') {
      autoValues[prop.id] = { type: 'last_edited_by', value: user.id };
    }
  }

  const templateValues = template.values as unknown as Record<string, PropertyValue>;

  const rowProperties: DatabaseRowProperties = {
    values: { ...autoValues, ...templateValues } as Record<string, PropertyValue>,
  };

  const row = await db
    .insert(blocks)
    .values({
      type: 'page' as BlockType,
      parentId: databaseId,
      pageId: databaseId,
      workspaceId: dbBlock.workspaceId,
      createdBy: user.id,
      properties: rowProperties as unknown as Record<string, unknown>,
      content: {},
    })
    .returning()
    .then((r) => r[0]!);

  const updatedRow = await db
    .update(blocks)
    .set({ pageId: row.id })
    .where(eq(blocks.id, row.id))
    .returning()
    .then((r) => r[0]!);

  await db.transaction(async (tx) => {
    const currentDb = await tx
      .select({ childrenOrder: blocks.childrenOrder })
      .from(blocks)
      .where(eq(blocks.id, databaseId))
      .limit(1)
      .then((r) => r[0]);
    if (currentDb) {
      await tx
        .update(blocks)
        .set({ childrenOrder: [...currentDb.childrenOrder, row.id] })
        .where(eq(blocks.id, databaseId));
    }
  });

  type TemplateBlockItem = { type: string; properties: Record<string, unknown>; content: Record<string, unknown>; children?: TemplateBlockItem[] };
  const contentBlocks = template.content as unknown as TemplateBlockItem[];
  const workspaceId = dbBlock.workspaceId;
  const createdBy = user.id;

  async function createContentBlocks(
    blocksList: TemplateBlockItem[],
    parentBlockId: string,
  ): Promise<void> {
    for (const blockDef of blocksList) {
      const childBlock = await db
        .insert(blocks)
        .values({
          type: blockDef.type as BlockType,
          parentId: parentBlockId,
          pageId: updatedRow.id,
          workspaceId,
          createdBy,
          properties: (blockDef.properties ?? {}) as Record<string, unknown>,
          content: (blockDef.content ?? {}) as Record<string, unknown>,
        })
        .returning()
        .then((r) => r[0]!);

      // Append to parent's childrenOrder
      const parentBlock = await db
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentBlockId))
        .limit(1)
        .then((r) => r[0]);
      if (parentBlock) {
        await db
          .update(blocks)
          .set({ childrenOrder: [...parentBlock.childrenOrder, childBlock.id] })
          .where(eq(blocks.id, parentBlockId));
      }

      if (blockDef.children && blockDef.children.length > 0) {
        await createContentBlocks(blockDef.children, childBlock.id);
      }
    }
  }

  if (contentBlocks.length > 0) {
    await createContentBlocks(contentBlocks, updatedRow.id);
  }

  checkAutomationsOnCreate(databaseId, updatedRow.id).catch(() => {});

  return c.json({ ...updatedRow, parentRowId: null }, 201);
});

export { databases };
