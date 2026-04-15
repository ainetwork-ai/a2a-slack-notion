import { prisma } from './prisma.js';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Wrap in quotes if it contains comma, newline, or double-quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

// ---------------------------------------------------------------------------
// Property value → display string
// ---------------------------------------------------------------------------

function propertyValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    // multi_select, files, people
    return value
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          return (obj['name'] ?? obj['label'] ?? JSON.stringify(v)) as string;
        }
        return String(v);
      })
      .join('; ');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // date objects
    if (obj['start']) return String(obj['start']);
    // select object
    if (obj['name']) return String(obj['name']);
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function databaseToCsv(databaseId: string): Promise<string> {
  // Load the database block (contains schema in properties)
  const database = await prisma.block.findUnique({
    where: { id: databaseId },
    select: { properties: true, childrenOrder: true },
  });

  if (!database) throw new Error('Database not found');

  const dbProps = (database.properties ?? {}) as Record<string, unknown>;
  const schema = (dbProps['schema'] ?? {}) as Record<
    string,
    { name: string; type: string }
  >;

  // Collect property definitions in order
  const propertyIds = Object.keys(schema);
  const propertyNames = propertyIds.map((id) => schema[id]?.name ?? id);

  // Fetch all database row blocks (type = page, direct children of database)
  const rows = await prisma.block.findMany({
    where: { parentId: databaseId, archived: false },
    select: { id: true, properties: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const lines: string[] = [];

  // Header row — always include "Title" + schema properties
  const header = ['Title', ...propertyNames];
  lines.push(rowToCsv(header));

  // Data rows
  for (const row of rows) {
    const rowProps = (row.properties ?? {}) as Record<string, unknown>;
    const title = (rowProps['title'] as string) ?? '';

    const cells: unknown[] = [title];
    for (const propId of propertyIds) {
      const propValue = rowProps[propId];
      cells.push(propertyValueToString(propValue));
    }

    lines.push(rowToCsv(cells));
  }

  return lines.join('\n');
}
