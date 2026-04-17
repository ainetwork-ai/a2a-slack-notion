'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Editor } from '@tiptap/core';
import { getEditorExtensions } from './extensions';
import { EditorBubbleMenu } from './BubbleMenu';
import { SlashCommandMenu } from './SlashCommand';
import { getEditor, setEditor } from '@/lib/notion/editor-pool';

interface CollaborativeEditorProps {
  pageId: string;
  /** Display name (unused for collab; kept for API compat). */
  userName?: string;
  editable?: boolean;
  workspaceId?: string;
}

/**
 * Pooled Tiptap editor with REST autosave.
 *
 * Seamless-transition invariants:
 *  - same `pageId` yields same `Editor` instance (via `editor-pool`)
 *  - unmount detaches the editor's DOM node but does NOT destroy the editor
 *  - panel ↔ full transition preserves selection/scroll via ProseMirror DOM reparenting
 *
 * Persistence:
 *  - On mount: GET /api/pages/:pageId/tiptap-doc → load saved JSON doc
 *  - On update: debounced 800ms PATCH /api/pages/:pageId/tiptap-doc → save JSON doc
 *  - On blur / visibilitychange(hidden): flush pending save immediately
 */
export function CollaborativeEditor({
  pageId,
  editable = true,
  workspaceId,
}: CollaborativeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditorState] = useState<Editor | null>(null);

  // Autosave state
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDocRef = useRef<Record<string, unknown> | null>(null);
  const isSavingRef = useRef(false);

  const flushSave = useCallback(async (doc: Record<string, unknown>) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await fetch(`/api/pages/${pageId}/tiptap-doc`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc, updatedAt: new Date().toISOString() }),
      });
    } catch {
      // best-effort — next update will retry
    } finally {
      isSavingRef.current = false;
    }
  }, [pageId]);

  const scheduleSave = useCallback((doc: Record<string, unknown>) => {
    pendingDocRef.current = doc;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const toSave = pendingDocRef.current;
      if (toSave) {
        pendingDocRef.current = null;
        void flushSave(toSave);
      }
    }, 800);
  }, [flushSave]);

  useEffect(() => {
    let e = getEditor(pageId);

    if (!e) {
      e = new Editor({
        extensions: getEditorExtensions({ workspaceId }),
        editable,
        editorProps: {
          attributes: { class: 'outline-none min-h-[200px]' },
        },
      });
      setEditor(pageId, e);

      // Load initial content from REST endpoint
      fetch(`/api/pages/${pageId}/tiptap-doc`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { doc: Record<string, unknown> } | null) => {
          if (data?.doc && e && !e.isDestroyed) {
            e.commands.setContent(data.doc, false);
          }
        })
        .catch(() => {/* no saved doc yet — start empty */});
    } else {
      e.setEditable(editable);
    }

    // Wire autosave on update
    const currentEditor = e;
    const onUpdate = () => {
      scheduleSave(currentEditor.getJSON() as Record<string, unknown>);
    };
    currentEditor.on('update', onUpdate);

    // Flush on blur
    const onBlur = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const toSave = pendingDocRef.current;
      if (toSave) {
        pendingDocRef.current = null;
        void flushSave(toSave);
      }
    };
    currentEditor.on('blur', onBlur);

    // Mount: reparent the ProseMirror DOM node into our container.
    const node = containerRef.current;
    if (node && currentEditor.view.dom.parentNode !== node) {
      node.appendChild(currentEditor.view.dom);
    }

    setEditorState(currentEditor);

    // Flush on tab hide
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onBlur();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      currentEditor.off('update', onUpdate);
      currentEditor.off('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // INTENTIONAL: do NOT destroy. The editor stays in the pool so the
      // panel ↔ full swap preserves selection / undo / scroll. Detach the
      // DOM node so React can re-parent cleanly on the next mount.
      if (node && currentEditor.view.dom.parentNode === node) {
        node.removeChild(currentEditor.view.dom);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, editable]);

  return (
    <div className="relative notion-editor">
      {editor ? (
        <>
          <EditorBubbleMenu editor={editor} />
          <SlashCommandMenu editor={editor} />
        </>
      ) : null}

      {/* Host node for the pooled ProseMirror DOM. */}
      <div ref={containerRef} className="tiptap-host" />

      <style jsx global>{`
        .notion-editor .tiptap { font-family: var(--font-sans); font-size: 16px; line-height: 1.5; color: var(--text-primary); }
        .notion-editor .tiptap p { margin: 2px 0; }
        .notion-editor .tiptap h1 { font-size: 30px; font-weight: 600; line-height: 1.3; margin-top: 32px; margin-bottom: 4px; }
        .notion-editor .tiptap h2 { font-size: 24px; font-weight: 600; line-height: 1.3; margin-top: 24px; margin-bottom: 4px; }
        .notion-editor .tiptap h3 { font-size: 20px; font-weight: 600; line-height: 1.3; margin-top: 16px; margin-bottom: 4px; }
        .notion-editor .tiptap ul, .notion-editor .tiptap ol { padding-left: 24px; margin: 2px 0; }
        .notion-editor .tiptap ul[data-type="taskList"] { padding-left: 0; list-style: none; }
        .notion-editor .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .notion-editor .tiptap ul[data-type="taskList"] li > label { margin-top: 3px; }
        .notion-editor .tiptap ul[data-type="taskList"] li > div { flex: 1; }
        .notion-editor .tiptap ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: var(--text-tertiary); }
        .notion-editor .tiptap blockquote { border-left: 3px solid var(--divider); padding-left: 16px; margin: 4px 0; color: var(--text-secondary); }
        .notion-editor .tiptap pre { background: var(--bg-sidebar); border-radius: var(--radius-md); padding: 16px; margin: 4px 0; overflow-x: auto; font-family: var(--font-mono); font-size: 14px; }
        .notion-editor .tiptap pre code { background: none; padding: 0; font-size: inherit; color: inherit; }
        .notion-editor .tiptap code { background: var(--bg-hover); padding: 2px 4px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 85%; color: var(--color-red); }
        .notion-editor .tiptap hr { border: none; border-top: 1px solid var(--divider); margin: 16px 0; }
        .notion-editor .tiptap mark { background-color: var(--bg-yellow); padding: 2px 0; }
        .notion-editor .tiptap a { color: var(--accent-blue); text-decoration: underline; cursor: pointer; }
        .notion-editor .tiptap img { max-width: 100%; border-radius: var(--radius-md); margin: 8px 0; }
        .notion-editor .tiptap table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .notion-editor .tiptap table td, .notion-editor .tiptap table th { border-bottom: 1px solid var(--divider); padding: 8px 12px; text-align: left; min-width: 100px; }
        .notion-editor .tiptap table th { font-weight: 600; background: var(--bg-sidebar); }
        .notion-editor .tiptap .is-empty::before { content: attr(data-placeholder); color: var(--text-tertiary); float: left; height: 0; pointer-events: none; }
      `}</style>
    </div>
  );
}
