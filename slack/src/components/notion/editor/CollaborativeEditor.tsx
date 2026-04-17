'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { getEditorExtensions } from './extensions';
import { EditorBubbleMenu } from './BubbleMenu';
import { SlashCommandMenu } from './SlashCommand';
import {
  useCollaboration,
  type ConnectionStatus,
  type ActiveUser,
} from '@/lib/notion/use-collaboration';
import { getEditor, setEditor } from '@/lib/notion/editor-pool';

interface CollaborativeEditorProps {
  pageId: string;
  /** Display name for awareness. Defaults to 'Anonymous'. TODO: thread from session. */
  userName?: string;
  editable?: boolean;
  workspaceId?: string;
}

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#4caf50',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Connected</span>
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="collab-dot-pulse"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#f59e0b',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Reconnecting...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: '#ef4444',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Offline</span>
    </div>
  );
}

function UserAvatar({ user, index }: { user: ActiveUser; index: number }) {
  const initial = user.name.charAt(0).toUpperCase();
  return (
    <div
      className="collab-avatar-wrapper"
      style={{ zIndex: 10 + index, marginLeft: index === 0 ? 0 : -8 }}
      title={user.name}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: user.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          border: '2px solid var(--bg-default)',
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        {initial}
      </div>
      <div className="collab-avatar-tooltip">{user.name}</div>
    </div>
  );
}

/**
 * Pooled collaborative Tiptap editor.
 *
 * Seamless-transition invariants:
 *  - same `pageId` yields same pooled Y.Doc (via `doc-pool`)
 *  - same `pageId` yields same `HocuspocusProvider` (via `useCollaboration` provider pool)
 *  - same `pageId` yields same `Editor` instance (via `editor-pool`)
 *  - unmount detaches the editor's DOM node but does NOT destroy the editor
 */
export function CollaborativeEditor({
  pageId,
  userName,
  editable = true,
  workspaceId,
}: CollaborativeEditorProps) {
  const { ydoc, provider, synced, user, connectionStatus, activeUsers } = useCollaboration({
    pageId,
    ...(userName != null ? { userName } : {}),
  });

  // Build extensions once per collab session (workspaceId, ydoc, provider, user are stable per pageId).
  const extensions = useMemo(
    () => [
      ...getEditorExtensions({ workspaceId }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider,
        user: { name: user.name, color: user.color },
      }),
    ],
    // `provider` and `ydoc` are stable from the pool for a given pageId, but we
    // recompute if pageId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId, workspaceId, ydoc, provider, user.name, user.color],
  );

  // Container for the editor's ProseMirror DOM node. Editor lives in the pool;
  // we reparent its `view.dom` into this container on every mount.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditorState] = useState<Editor | null>(null);

  useEffect(() => {
    let e = getEditor(pageId);

    if (!e) {
      e = new Editor({
        extensions,
        editable,
        editorProps: {
          attributes: { class: 'outline-none min-h-[200px]' },
        },
      });
      setEditor(pageId, e);
    } else {
      // Editor already exists — just refresh editable state. The Collaboration
      // extension is keyed to the (pooled) Y.Doc, so content is automatically
      // in sync.
      e.setEditable(editable);
    }

    // Mount: reparent the ProseMirror DOM node into our container.
    const node = containerRef.current;
    if (node && e.view.dom.parentNode !== node) {
      node.appendChild(e.view.dom);
    }

    setEditorState(e);

    return () => {
      // INTENTIONAL: do NOT destroy. The editor stays in the pool so the
      // panel ↔ full swap preserves selection / undo / scroll. Detach the
      // DOM node so React can re-parent cleanly on the next mount.
      if (node && e && e.view.dom.parentNode === node) {
        node.removeChild(e.view.dom);
      }
    };
    // `extensions` intentionally excluded — editor is pooled; swapping
    // extensions across mounts would reset ProseMirror state and defeat the
    // pool. If `workspaceId` or similar changes, a fresh pageId drives pool
    // eviction upstream (see `destroyEditor`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, editable]);

  return (
    <div className="relative notion-editor">
      {/* Editor header: connection status + active users */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          marginBottom: 4,
        }}
      >
        <ConnectionIndicator status={connectionStatus} />

        {activeUsers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {activeUsers.map((u, i) => (
              <UserAvatar key={`${u.name}-${u.clientId ?? i}`} user={u} index={i} />
            ))}
          </div>
        )}
      </div>

      {!synced && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-default)]/80 z-10">
          <span className="text-sm text-[var(--text-tertiary)]">Connecting...</span>
        </div>
      )}

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

        /* Collaboration cursor styles */
        .collaboration-cursor__caret {
          border-left: 2px solid;
          border-right: none;
          margin-left: -1px;
          margin-right: -1px;
          pointer-events: none;
          position: relative;
          word-break: normal;
        }

        .collaboration-cursor__label {
          border-radius: 3px;
          color: #fff;
          font-size: 11px;
          font-weight: 500;
          left: -1px;
          line-height: normal;
          padding: 1px 6px;
          position: absolute;
          top: -1.4em;
          user-select: none;
          white-space: nowrap;
        }

        /* Connection status pulse animation */
        @keyframes collab-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .collab-dot-pulse {
          animation: collab-pulse 1.2s ease-in-out infinite;
        }

        /* Avatar tooltip */
        .collab-avatar-wrapper {
          position: relative;
          display: inline-flex;
        }
        .collab-avatar-tooltip {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: var(--bg-tooltip, #191919);
          color: #fff;
          font-size: 12px;
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s;
          z-index: 100;
        }
        .collab-avatar-wrapper:hover .collab-avatar-tooltip {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
