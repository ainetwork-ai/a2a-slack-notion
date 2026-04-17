'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Collaboration from '@tiptap/extension-collaboration';
// CollaborationCursor@2 uses y-prosemirror while Collaboration@3 uses @tiptap/y-tiptap (different ySyncPluginKey)
// — incompatible, crashes on Plugin.init. Remove until a v3-compatible cursor extension is available.
import { getEditorExtensions } from './extensions';
import { EditorBubbleMenu } from './bubble-menu';
import { useCollaboration, type ConnectionStatus, type ActiveUser } from './use-collaboration';
import { BlockHandleOverlay } from './block-handle-overlay';
import { BlockContextMenu } from './block-context-menu';
import { BlockSelectionToolbar } from './block-selection-toolbar';
import { BlockDragProvider } from './block-drag-overlay';
import { CommentBubble, type CommentBubblePosition } from './comment-bubble';
import { CommentSidebar } from './comment-sidebar';
import { RevisionOverlay } from './revision-overlay';
import { useCommentAgent } from './use-comment-agent';
import { findCommentHighlightRange } from './extensions/comment-highlight';
import { blockHandleState } from './block-handle-state';

interface CommentContent {
  text: string
  selectedText: string
  commentMarkId: string
}

interface PageComment {
  id: string
  content: CommentContent
  author: { name: string; avatar: string | null }
  resolved: boolean
  createdAt: string
  replies: PageComment[]
}

interface CollaborativeEditorProps {
  pageId: string;
  userName: string;
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

const AGENT_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

interface StreamingAgent {
  agentId: string;
  name: string;
  color: string;
}

export function CollaborativeEditor({ pageId, userName, editable = true, workspaceId }: CollaborativeEditorProps) {
  const { ydoc, synced, connectionStatus, activeUsers } = useCollaboration({ pageId, userName });

  const editorRef = useRef<Editor | null>(null);
  const workspaceIdRef = useRef(workspaceId ?? '');
  const abortControllerRef = useRef<AbortController | null>(null);
  const [streamingAgents, setStreamingAgents] = useState<StreamingAgent[]>([]);
  // Optimistic badge: set before fetch so it renders even if SSE never fires
  const [pendingAgent, setPendingAgent] = useState<StreamingAgent | null>(null);

  const [bubblePosition, setBubblePosition] = useState<CommentBubblePosition | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [pageComments, setPageComments] = useState<PageComment[]>([]);
  const [revisionAnchorRects, setRevisionAnchorRects] = useState<Map<string, DOMRect>>(new Map());
  const [workspaceAgents, setWorkspaceAgents] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId ?? '';
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const resolveAgentId = useCallback(
    (name: string) => {
      return workspaceAgents.find(
        (a) => a.name.toLowerCase().includes(name.toLowerCase()),
      )?.id;
    },
    [workspaceAgents],
  );

  const { revisions, startRevision, acceptRevision, rejectRevision } = useCommentAgent({
    workspaceId: workspaceId ?? '',
    pageId,
    editorRef,
    resolveAgentId,
  });

  const handleAgentInvoke = useCallback(async (params: { agentId: string; agentName: string; prompt: string; pageId: string; workspaceId: string }) => {
    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ??
      `${window.location.protocol}//${window.location.hostname}:3011`;

    // Abort any previous in-flight stream and create a new controller
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Optimistic badge — shows immediately before SSE stream starts
    const pendingColor = AGENT_COLORS[params.agentId.charCodeAt(0) % AGENT_COLORS.length] ?? '#6366f1';
    setPendingAgent({ agentId: params.agentId, name: params.agentName || 'Agent', color: pendingColor });

    try {
      const response = await fetch(`${apiUrl}/api/v1/agents/invoke?stream=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortController.signal,
        body: JSON.stringify({
          agentId: params.agentId,
          prompt: params.prompt,
          pageId: params.pageId,
          workspaceId: params.workspaceId,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Invoke failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;

          try {
            const chunk = JSON.parse(raw) as { type: string; content: string };

            if (chunk.type === 'agent_start') {
              const info = JSON.parse(chunk.content) as { agentId: string; name: string };
              const color = AGENT_COLORS[info.agentId.charCodeAt(0) % AGENT_COLORS.length] ?? '#6366f1';
              setPendingAgent(null); // real badge takes over
              setStreamingAgents(prev => [...prev.filter(a => a.agentId !== info.agentId), { ...info, color }]);
            } else if (chunk.type === 'agent_end') {
              const info = JSON.parse(chunk.content) as { agentId: string };
              setStreamingAgents(prev => prev.filter(a => a.agentId !== info.agentId));
            } else if (chunk.content && editorRef.current && !abortController.signal.aborted) {
              editorRef.current.commands.insertContent(chunk.content);
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) return; // intentional abort, ignore
      console.error('[Agent Invoke Error]', error);
      setPendingAgent(null);
      setStreamingAgents([]);
      try {
        const res = await fetch(`${apiUrl}/api/v1/agents/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(params),
        });
        const result = await res.json() as { content?: string };
        if (result.content && editorRef.current) {
          editorRef.current.commands.insertContent(result.content);
        }
      } catch (fallbackError) {
        console.error('[Agent Invoke Fallback Error]', fallbackError);
      }
    }
  }, []);


  const handleCommentSubmit = useCallback(async (content: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    const commentMarkId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

    editor.commands.setTextSelection({ from, to });
    editor.commands.setCommentHighlight({ commentId: commentMarkId, status: 'active' });
    editor.commands.setTextSelection(to);

    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ??
      `${window.location.protocol}//${window.location.hostname}:3011`;

    try {
      const res = await fetch(`${apiUrl}/api/v1/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          blockId: pageId,
          content: { text: content, selectedText, commentMarkId },
        }),
      });
      if (res.ok) {
        const newComment = await res.json() as PageComment;
        setPageComments((prev) => [newComment, ...prev]);
      }
    } catch {
      // comment saved locally on mark, DB sync best-effort
    }

    setBubblePosition(null);

    if (content.includes('@')) {
      await startRevision({ commentMarkId, commentText: content, selectedText });
    }
  }, [pageId, startRevision]);

  const handleCommentClick = useCallback(
    (commentMarkId: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      const range = findCommentHighlightRange(editor.state.doc, commentMarkId);
      if (!range) return;

      editor.commands.setTextSelection(range.from);
      editor.commands.scrollIntoView();

      const coords = editor.view.coordsAtPos(range.from);
      const endCoords = editor.view.coordsAtPos(range.to);
      const rect = new DOMRect(
        coords.left,
        coords.top,
        endCoords.right - coords.left,
        endCoords.bottom - coords.top,
      );
      setRevisionAnchorRects((prev) => new Map(prev).set(commentMarkId, rect));
    },
    [],
  );

  const handleResolveComment = useCallback(async (commentId: string) => {
    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ??
      `${window.location.protocol}//${window.location.hostname}:3011`;

    await fetch(`${apiUrl}/api/v1/comments/${commentId}/resolve`, {
      method: 'PATCH',
      credentials: 'include',
    }).catch(() => {});

    setPageComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
    );
    const comment = pageComments.find((c) => c.id === commentId);
    if (comment?.content.commentMarkId) {
      editorRef.current?.commands.updateCommentHighlightStatus(
        comment.content.commentMarkId,
        'resolved',
      );
    }
  }, [pageComments]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ??
      `${window.location.protocol}//${window.location.hostname}:3011`;

    await fetch(`${apiUrl}/api/v1/comments/${commentId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});

    const comment = pageComments.find((c) => c.id === commentId);
    if (comment?.content.commentMarkId) {
      editorRef.current?.commands.removeCommentHighlight(comment.content.commentMarkId);
    }
    setPageComments((prev) => prev.filter((c) => c.id !== commentId));
  }, [pageComments]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...getEditorExtensions({ workspaceId, getWorkspaceId: () => workspaceIdRef.current, pageId, onAgentInvoke: handleAgentInvoke, collaboration: true }),
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    editable,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[200px]',
      },
    },
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    blockHandleState.onCommentRequest = (blockPos: number, rect: DOMRect) => {
      const ed = editorRef.current;
      if (!ed) return;
      const container = editorContainerRef.current?.getBoundingClientRect();
      if (!container) return;
      const node = ed.state.doc.nodeAt(blockPos);
      const selectedText = node
        ? ed.state.doc.textBetween(blockPos + 1, blockPos + node.nodeSize - 1, ' ')
        : '';
      setBubblePosition({
        top: rect.bottom - container.top + 4,
        left: rect.left - container.left,
        selectedText,
      });
    };
    return () => { blockHandleState.onCommentRequest = null; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const apiUrl =
      process.env['NEXT_PUBLIC_API_URL'] ??
      (typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3011`
        : 'http://localhost:3011');

    Promise.all([
      fetch(`${apiUrl}/api/v1/agents?workspace_id=${workspaceId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((agents: Array<{ id: string; name: string }>) => setWorkspaceAgents(agents))
        .catch(() => {}),
      fetch(`${apiUrl}/api/v1/comments?block_id=${pageId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((comments: PageComment[]) => setPageComments(comments))
        .catch(() => {}),
    ]);
  }, [workspaceId, pageId]);

  if (!editor) return null;

  return (
    <BlockDragProvider>
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
              <UserAvatar key={`${u.name}-${i}`} user={u} index={i} />
            ))}
          </div>
        )}
      </div>

      {(streamingAgents.length > 0 || pendingAgent) && (
        <div className="flex gap-2 flex-wrap" style={{ marginBottom: 6 }}>
          {/* Pending badge: subdued until SSE agent_start confirms streaming */}
          {pendingAgent && !streamingAgents.find(a => a.agentId === pendingAgent.agentId) && (
            <div
              key={`pending-${pendingAgent.agentId}`}
              className="agent-typing-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 20,
                boxShadow: `0 0 0 1.5px ${pendingAgent.color}40`,
                background: `${pendingAgent.color}18`,
                fontSize: 12,
                color: pendingAgent.color,
                fontWeight: 500,
                opacity: 0.5,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: pendingAgent.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {pendingAgent.name} is writing
              <span className="agent-typing-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          )}
          {/* Confirmed streaming badges: full opacity with pulse */}
          {streamingAgents.map(agent => (
            <div
              key={agent.agentId}
              className="agent-typing-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 20,
                boxShadow: `0 0 0 1.5px ${agent.color}40`,
                background: `${agent.color}18`,
                fontSize: 12,
                color: agent.color,
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: agent.color,
                  display: 'inline-block',
                  flexShrink: 0,
                  animation: 'collab-pulse 1.2s ease-in-out infinite',
                }}
              />
              {agent.name} is writing
              <span className="agent-typing-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!synced && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-default)]/80 z-10">
          <span className="text-sm text-[var(--text-tertiary)]">Connecting...</span>
        </div>
      )}

      <div className="flex h-full">
        {/* Editor area */}
        <div ref={editorContainerRef} className="relative flex-1 overflow-auto">
          <EditorBubbleMenu editor={editor} />
          <EditorContent editor={editor} />
          <BlockHandleOverlay />
          <BlockContextMenu />
          <BlockSelectionToolbar />

          <CommentBubble
            position={bubblePosition}
            onSubmit={handleCommentSubmit}
            onClose={() => setBubblePosition(null)}
            workspaceId={workspaceId ?? ''}
          />

          {[...revisions.values()].map((revision) => (
            <RevisionOverlay
              key={revision.commentMarkId}
              revision={revision}
              anchorRect={revisionAnchorRects.get(revision.commentMarkId) ?? null}
              onAccept={acceptRevision}
              onReject={rejectRevision}
            />
          ))}
        </div>

        {pageComments.length > 0 && (
          <CommentSidebar
            comments={pageComments}
            onCommentClick={handleCommentClick}
            onResolve={handleResolveComment}
            onDelete={handleDeleteComment}
          />
        )}
      </div>

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
        .notion-editor .tiptap .is-empty:hover::before { color: var(--text-secondary); }

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

        /* Agent typing dots animation */
        .agent-typing-dots span {
          opacity: 0;
          animation: agent-dot-fade 1.4s ease-in-out infinite;
        }
        .agent-typing-dots span:nth-child(1) { animation-delay: 0s; }
        .agent-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .agent-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes agent-dot-fade {
          0%, 60%, 100% { opacity: 0; }
          30% { opacity: 1; }
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
    </BlockDragProvider>
  );
}
