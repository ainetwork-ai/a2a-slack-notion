/**
 * Y.Doc pool — one shared `Y.Doc` per pageId for the lifetime of the tab.
 *
 * Invariant: panel mode and full-page mode both read/write the same doc, so
 * cursor, selection, and undo history survive the panel ↔ full transition
 * with zero re-sync.
 *
 * Note: `yjs` is declared in package.json but may not be installed yet.
 * "Cannot find module" errors disappear after `pnpm install`.
 */

import type { Doc as YDoc } from 'yjs';

const pool = new Map<string, YDoc>();
const listeners = new Set<() => void>();

export function getOrCreateDoc(pageId: string, factory: () => YDoc): YDoc {
  let doc = pool.get(pageId);
  if (!doc) {
    doc = factory();
    pool.set(pageId, doc);
    listeners.forEach((fn) => fn());
  }
  return doc;
}

export function getDoc(pageId: string): YDoc | undefined {
  return pool.get(pageId);
}

export function destroyDoc(pageId: string): void {
  const doc = pool.get(pageId);
  if (!doc) return;
  try {
    doc.destroy();
  } catch {
    // swallow — redundant destroy is safe to ignore
  }
  pool.delete(pageId);
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function __poolSize(): number {
  return pool.size;
}
