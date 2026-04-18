import { and, asc, eq } from 'drizzle-orm';
import { db } from './db';
import { blocks } from '@slack-db/schema';

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

function propertyValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
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
    if (obj['start']) return String(obj['start']);
    if (obj['name']) return String(obj['name']);
  }
  return JSON.stringify(value);
}

export async function databaseToCsv(databaseId: string): Promise<string> {
  const database = await db
    .select({ properties: blocks.properties, childrenOrder: blocks.childrenOrder })
    .from(blocks)
    .where(eq(blocks.id, databaseId))
    .limit(1)
    .then((r) => r[0]);

  if (!database) throw new Error('Database not found');

  const dbProps = (database.properties ?? {}) as Record<string, unknown>;
  const schema = (dbProps['schema'] ?? {}) as Record<
    string,
    { name: string; type: string }
  >;

  const propertyIds = Object.keys(schema);
  const propertyNames = propertyIds.map((id) => schema[id]?.name ?? id);

  const rows = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      createdAt: blocks.createdAt,
    })
    .from(blocks)
    .where(and(eq(blocks.parentId, databaseId), eq(blocks.archived, false)))
    .orderBy(asc(blocks.createdAt));

  const lines: string[] = [];

  const header = ['Title', ...propertyNames];
  lines.push(rowToCsv(header));

  for (const row of rows) {
    const rowProps = (row.properties ?? {}) as Record<string, unknown>;
    const title = (rowProps['title'] as string) ?? '';

    const cells: unknown[] = [title];
    for (const propId of propertyIds) {
      cells.push(propertyValueToString(rowProps[propId]));
    }

    lines.push(rowToCsv(cells));
  }

  return lines.join('\n');
}
