/**
 * Tiptap Editor pool — one `Editor` instance per pageId.
 *
 * The invariant: the panel view and the full-page
 * view for the same pageId mount the SAME editor instance. So when the user
 * collapses the side panel and re-expands it (or navigates between modes),
 * selection, undo stack, scroll position, and focus are all preserved.
 *
 * Lifetime: pool survives React unmounts. Entries are evicted explicitly via
 * `destroyEditor(pageId)` on true navigation-away (e.g. page delete, tab
 * close). Panel ↔ full transitions MUST NOT evict.
 *
 * Note: `@tiptap/react` is declared in package.json but may not be installed
 * yet. "Cannot find module" errors vanish once `pnpm install` runs.
 */

import type { Editor } from '@tiptap/react';

const pool = new Map<string, Editor>();

export function getOrCreateEditor(pageId: string, factory: () => Editor): Editor {
  let editor = pool.get(pageId);
  if (!editor) {
    editor = factory();
    pool.set(pageId, editor);
  }
  return editor;
}

export function getEditor(pageId: string): Editor | undefined {
  return pool.get(pageId);
}

export function setEditor(pageId: string, editor: Editor): void {
  pool.set(pageId, editor);
}

export function destroyEditor(pageId: string): void {
  const editor = pool.get(pageId);
  if (!editor) return;
  try {
    editor.destroy();
  } catch {
    // swallow — destroy-on-destroyed is a no-op we can ignore
  }
  pool.delete(pageId);
}

export function __poolSize(): number {
  return pool.size;
}
