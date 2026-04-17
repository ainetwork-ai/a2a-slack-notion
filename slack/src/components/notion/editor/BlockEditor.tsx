'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useCallback, useRef } from 'react';
import { getEditorExtensions } from './extensions';
import { EditorBubbleMenu } from './BubbleMenu';
import { SlashCommandMenu } from './SlashCommand';

interface BlockEditorProps {
  content?: JSONContent;
  onUpdate?: (content: JSONContent) => void;
  editable?: boolean;
  workspaceId?: string;
}

export function BlockEditor({ content, onUpdate, editable = true, workspaceId }: BlockEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpdate = useCallback(
    ({ editor }: { editor: Editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate?.(editor.getJSON());
      }, 500);
    },
    [onUpdate],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: getEditorExtensions({ workspaceId }),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[200px]',
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="relative notion-editor">
      <EditorBubbleMenu editor={editor} />
      <SlashCommandMenu editor={editor} />
      <EditorContent editor={editor} />

      <style jsx global>{`
        .notion-editor .tiptap {
          font-family: var(--font-sans);
          font-size: 16px;
          line-height: 1.5;
          color: var(--text-primary);
        }

        .notion-editor .tiptap p {
          margin: 2px 0;
        }

        .notion-editor .tiptap h1 {
          font-size: 30px;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 32px;
          margin-bottom: 4px;
        }

        .notion-editor .tiptap h2 {
          font-size: 24px;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 24px;
          margin-bottom: 4px;
        }

        .notion-editor .tiptap h3 {
          font-size: 20px;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 16px;
          margin-bottom: 4px;
        }

        .notion-editor .tiptap ul,
        .notion-editor .tiptap ol {
          padding-left: 24px;
          margin: 2px 0;
        }

        .notion-editor .tiptap ul[data-type="taskList"] {
          padding-left: 0;
          list-style: none;
        }

        .notion-editor .tiptap ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .notion-editor .tiptap ul[data-type="taskList"] li > label {
          margin-top: 3px;
        }

        .notion-editor .tiptap ul[data-type="taskList"] li > div {
          flex: 1;
        }

        .notion-editor .tiptap ul[data-type="taskList"] li[data-checked="true"] > div {
          text-decoration: line-through;
          color: var(--text-tertiary);
        }

        .notion-editor .tiptap blockquote {
          border-left: 3px solid var(--divider);
          padding-left: 16px;
          margin: 4px 0;
          color: var(--text-secondary);
        }

        .notion-editor .tiptap pre {
          background: var(--bg-sidebar);
          border-radius: var(--radius-md);
          padding: 16px;
          margin: 4px 0;
          overflow-x: auto;
          font-family: var(--font-mono);
          font-size: 14px;
        }

        .notion-editor .tiptap pre code {
          background: none;
          padding: 0;
          font-size: inherit;
          color: inherit;
        }

        .notion-editor .tiptap code {
          background: var(--bg-hover);
          padding: 2px 4px;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 85%;
          color: var(--color-red);
        }

        .notion-editor .tiptap hr {
          border: none;
          border-top: 1px solid var(--divider);
          margin: 16px 0;
        }

        .notion-editor .tiptap mark {
          background-color: var(--bg-yellow);
          padding: 2px 0;
        }

        .notion-editor .tiptap a {
          color: var(--accent-blue);
          text-decoration: underline;
          cursor: pointer;
        }

        .notion-editor .tiptap img {
          max-width: 100%;
          border-radius: var(--radius-md);
          margin: 8px 0;
        }

        .notion-editor .tiptap table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }

        .notion-editor .tiptap table td,
        .notion-editor .tiptap table th {
          border-bottom: 1px solid var(--divider);
          padding: 8px 12px;
          text-align: left;
          min-width: 100px;
        }

        .notion-editor .tiptap table th {
          font-weight: 600;
          background: var(--bg-sidebar);
        }

        .notion-editor .tiptap .is-empty::before {
          content: attr(data-placeholder);
          color: var(--text-tertiary);
          float: left;
          height: 0;
          pointer-events: none;
        }

        /* Block drag handle */
        .notion-editor .tiptap > * {
          position: relative;
        }

        .block-drag-handle {
          position: absolute;
          left: -28px;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
          opacity: 0;
          cursor: grab;
          border-radius: var(--radius-sm);
          transition: opacity 100ms ease, background-color 100ms ease;
          user-select: none;
          z-index: 10;
        }

        .block-drag-handle:hover {
          background-color: var(--bg-hover);
          color: var(--text-secondary);
        }

        .block-drag-handle:active {
          cursor: grabbing;
        }

        .notion-editor .tiptap > *:hover > .block-drag-handle,
        .notion-editor .tiptap > *:hover .block-drag-handle {
          opacity: 1;
        }

        /* Show handle when hovering the block row */
        .notion-editor .tiptap > p:hover .block-drag-handle,
        .notion-editor .tiptap > h1:hover .block-drag-handle,
        .notion-editor .tiptap > h2:hover .block-drag-handle,
        .notion-editor .tiptap > h3:hover .block-drag-handle,
        .notion-editor .tiptap > ul:hover .block-drag-handle,
        .notion-editor .tiptap > ol:hover .block-drag-handle,
        .notion-editor .tiptap > blockquote:hover .block-drag-handle,
        .notion-editor .tiptap > pre:hover .block-drag-handle,
        .notion-editor .tiptap > hr:hover .block-drag-handle,
        .notion-editor .tiptap > div:hover .block-drag-handle {
          opacity: 1;
        }

        /* Block handle context menu */
        .block-handle-menu {
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 160px;
          background: var(--bg-default);
          box-shadow: var(--shadow-menu);
          border-radius: var(--radius-md);
          padding: 4px;
          z-index: 50;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .block-handle-menu-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 6px 8px;
          font-size: 14px;
          color: var(--text-primary);
          border-radius: var(--radius-sm);
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          transition: background-color 100ms ease;
        }

        .block-handle-menu-item:hover {
          background-color: var(--bg-hover);
        }

        /* Drop cursor (ProseMirror built-in) */
        .ProseMirror-dropcursor {
          border-top: 2px solid var(--accent-blue);
          border-radius: 1px;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
