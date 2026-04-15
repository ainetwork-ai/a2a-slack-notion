// Core types — will be expanded with Prisma schema
export type BlockType =
  | 'page'
  | 'text'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list'
  | 'numbered_list'
  | 'to_do'
  | 'toggle'
  | 'callout'
  | 'code'
  | 'divider'
  | 'image'
  | 'quote'
  | 'table'
  | 'bookmark'
  | 'file'
  | 'embed'
  | 'database';

export type WorkspaceRole = 'admin' | 'member' | 'guest';

export type PagePermission = 'full_access' | 'can_edit' | 'can_comment' | 'can_view';
