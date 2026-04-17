/**
 * Central tool registry. Composes all feature modules into a single Map keyed
 * by tool name. Both `ListTools` and `CallTool` handlers in src/index.ts read
 * from here, so adding a new tool only requires editing its feature module
 * plus this import list.
 */

import { pageTools } from './pages.js';
import { blockTools } from './blocks.js';
import { databaseTools } from './databases.js';
import { commentTools } from './comments.js';
import { searchTools } from './search.js';
import type { ToolDescriptor } from './types.js';

export const allTools: ToolDescriptor[] = [
  ...pageTools,
  ...blockTools,
  ...databaseTools,
  ...commentTools,
  ...searchTools,
];

export const toolMap: Map<string, ToolDescriptor> = new Map(
  allTools.map((t) => [t.name, t] as const),
);

export type { ToolDescriptor };
