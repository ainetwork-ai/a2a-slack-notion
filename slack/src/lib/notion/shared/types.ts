// Core types — ported from notion/packages/shared/src/types.ts
// Reconciliation note: slack's drizzle schema (src/lib/db/schema.ts) already
// exports canonical `BlockType` and `PermissionLevel` types that match what
// Notion's shared package needed. We re-export them here so there is a single
// source of truth driven by the DB schema.

export type { BlockType, PermissionLevel } from '@/lib/db/schema';

// WorkspaceRole is specific to notion's permission model and has no
// drizzle-inferred equivalent in slack's schema — keep it here.
export type WorkspaceRole = 'admin' | 'member' | 'guest';

// PagePermission mirrors drizzle's `PermissionLevel`. Kept as an alias for
// backwards compatibility with notion code that imports `PagePermission`.
import type { PermissionLevel } from '@/lib/db/schema';
export type PagePermission = PermissionLevel;
