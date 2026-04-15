export interface PaginatedResponse<T> {
  object: 'list';
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString();
}
