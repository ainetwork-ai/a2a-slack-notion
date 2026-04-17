// ============================================================
// Database Property System
// ============================================================

export type PropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'person'
  | 'files'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'status'
  | 'formula'
  | 'relation'
  | 'rollup'
  | 'created_time'
  | 'created_by'
  | 'last_edited_time'
  | 'last_edited_by';

export type NumberFormat =
  | 'number'
  | 'number_with_commas'
  | 'percent'
  | 'dollar'
  | 'euro'
  | 'won'
  | 'yen';

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface StatusGroup {
  id: string;
  name: string;
  color: string;
  optionIds: string[];
}

// ============================================================
// Formula / Relation / Rollup configuration
// ============================================================

/** Formula expression stored in the property definition */
export interface FormulaConfig {
  expression: string; // e.g. "prop(\"Price\") * prop(\"Quantity\")"
}

/** Relation links two databases bidirectionally */
export interface RelationConfig {
  relatedDatabaseId: string;
  /** The reverse-relation property id in the related database (auto-created) */
  reversePropertyId?: string;
}

export type RollupFunction = 'count' | 'count_values' | 'sum' | 'avg' | 'min' | 'max'
  | 'median' | 'range' | 'percent_empty' | 'percent_not_empty'
  | 'show_original' | 'show_unique';

export interface RollupConfig {
  relationPropertyId: string; // which relation property to traverse
  targetPropertyId: string;   // which property in the related DB to aggregate
  function: RollupFunction;
}

/** Property definition stored in the database block's properties.schema */
export interface PropertyDefinition {
  id: string;
  name: string;
  type: PropertyType;
  /** Options for select / multi_select */
  options?: SelectOption[];
  /** Number display format */
  numberFormat?: NumberFormat;
  /** Status groups (To Do, In Progress, Done) */
  statusGroups?: StatusGroup[];
  /** Formula config */
  formula?: FormulaConfig;
  /** Relation config */
  relation?: RelationConfig;
  /** Rollup config */
  rollup?: RollupConfig;
}

/** Property value stored in each row block's properties.values */
export type PropertyValue =
  | { type: 'title'; value: string }
  | { type: 'text'; value: string }
  | { type: 'number'; value: number | null }
  | { type: 'select'; value: string | null } // option id
  | { type: 'multi_select'; value: string[] }
  | { type: 'date'; value: DateValue | null }
  | { type: 'person'; value: string[] } // user ids
  | { type: 'files'; value: FileValue[] }
  | { type: 'checkbox'; value: boolean }
  | { type: 'url'; value: string }
  | { type: 'email'; value: string }
  | { type: 'phone'; value: string }
  | { type: 'status'; value: string | null } // option id
  | { type: 'formula'; value: FormulaResult } // computed (read-only)
  | { type: 'relation'; value: string[] } // related row ids
  | { type: 'rollup'; value: RollupResult } // computed (read-only)
  | { type: 'created_time'; value: string } // ISO timestamp (auto)
  | { type: 'created_by'; value: string } // user id (auto)
  | { type: 'last_edited_time'; value: string } // ISO timestamp (auto)
  | { type: 'last_edited_by'; value: string }; // user id (auto)

/** Formula evaluation result */
export type FormulaResult =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'error'; value: string };

/** Rollup aggregation result */
export type RollupResult =
  | { type: 'number'; value: number }
  | { type: 'array'; value: unknown[] }
  | { type: 'error'; value: string };

export interface DateValue {
  start: string; // ISO date
  end?: string; // ISO date (for date ranges)
  includeTime?: boolean;
}

export interface FileValue {
  name: string;
  url: string;
  size?: number;
}

// ============================================================
// Database Schema (stored in database block properties)
// ============================================================

export interface DatabaseSchema {
  /** Ordered property definitions */
  properties: PropertyDefinition[];
}

export interface DatabaseBlockProperties {
  title: string;
  icon?: string | null;
  coverUrl?: string | null;
  schema: DatabaseSchema;
}

/** Row block properties (child of database block) */
export interface DatabaseRowProperties {
  /** Property values keyed by property definition id */
  values: Record<string, PropertyValue>;
}

// ============================================================
// Database Views
// ============================================================

export type ViewType = 'table' | 'board' | 'list' | 'calendar' | 'gallery' | 'timeline';

export type FilterOperator =
  | 'equals'
  | 'does_not_equal'
  | 'contains'
  | 'does_not_contain'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'is_checked'
  | 'is_not_checked';

export interface FilterCondition {
  propertyId: string;
  operator: FilterOperator;
  value?: unknown;
}

export type FilterLogic = 'and' | 'or';

export interface FilterGroup {
  logic: FilterLogic;
  conditions: FilterCondition[];
}

export type SortDirection = 'ascending' | 'descending';

export interface SortRule {
  propertyId: string;
  direction: SortDirection;
}

export interface GroupRule {
  propertyId: string;
  hidden?: string[]; // hidden group ids
}

export interface ViewConfig {
  /** Which property columns are visible (table) or shown (card) */
  visibleProperties: string[]; // property definition ids
  /** Column widths for table view (propertyId -> px) */
  columnWidths?: Record<string, number>;
  /** Board: which property to group by */
  boardGroupBy?: string; // property id (select/status)
  /** Calendar: which date property */
  calendarDateProperty?: string;
  /** Gallery: cover property (files type) */
  galleryCoverProperty?: string;
  /** Gallery: card size */
  galleryCardSize?: 'small' | 'medium' | 'large';
  /** Timeline: start date property */
  timelineStartProperty?: string;
  /** Timeline: end date property */
  timelineEndProperty?: string;
  /** Timeline: zoom level */
  timelineZoom?: 'day' | 'week' | 'month';
}

export interface DatabaseViewData {
  id: string;
  databaseId: string;
  name: string;
  type: ViewType;
  filters: FilterGroup;
  sorts: SortRule[];
  groupBy?: GroupRule;
  config: ViewConfig;
  position: number;
}

// ============================================================
// Default property colors
// ============================================================

export const PROPERTY_COLORS = [
  'default', 'gray', 'brown', 'orange', 'yellow',
  'green', 'blue', 'purple', 'pink', 'red',
] as const;

export type PropertyColor = typeof PROPERTY_COLORS[number];

export const DEFAULT_STATUS_GROUPS: Omit<StatusGroup, 'optionIds'>[] = [
  { id: 'todo', name: 'To Do', color: 'gray' },
  { id: 'in_progress', name: 'In Progress', color: 'blue' },
  { id: 'done', name: 'Done', color: 'green' },
];

/** Auto-computed property types (read-only, server-managed) */
export const AUTO_PROPERTIES: PropertyType[] = [
  'formula', 'rollup',
  'created_time', 'created_by', 'last_edited_time', 'last_edited_by',
];

// ============================================================
// Database Templates
// ============================================================

export interface TemplateBlock {
  type: string;
  properties: Record<string, unknown>;
  content: Record<string, unknown>;
  children?: TemplateBlock[];
}

export interface DatabaseTemplate {
  id: string;
  databaseId: string;
  name: string;
  description?: string;
  icon?: string;
  content: TemplateBlock[];
  values: Record<string, PropertyValue>;
  isDefault: boolean;
  position: number;
}
