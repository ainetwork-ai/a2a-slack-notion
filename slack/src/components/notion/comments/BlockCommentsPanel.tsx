'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { X, CheckCircle, Circle, Reply, Pencil, Trash2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { useComments, extractContent, type BlockComment } from './use-comments';
import { useAuth } from '@/lib/hooks/use-auth';

interface BlockCommentsPanelProps {
  blockId: string;
  onClose?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const nameColors = ['#e879f9', '#36c5f0', '#2eb67d', '#ecb22e', '#e01e5a', '#ff6b6b', '#4ecdc4'];
function getNameColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return nameColors[Math.abs(hash) % nameColors.length];
}

interface CommentRowProps {
  comment: BlockComment;
  currentUserId: string | undefined;
  isReply?: boolean;
  onReply: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
  onEditSave: (content: string) => void;
}

function CommentRow({
  comment,
  currentUserId,
  isReply = false,
  onReply,
  onToggleResolved,
  onDelete,
  onEditSave,
}: CommentRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(extractContent(comment.content));
  const isOwn = comment.authorId === currentUserId;
  const displayName = comment.authorName ?? comment.authorId.slice(0, 8);
  const initials = getInitials(displayName);
  const timeAgo = (() => {
    try {
      return formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true });
    } catch {
      return '';
    }
  })();

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editValue.trim()) {
        onEditSave(editValue.trim());
        setIsEditing(false);
      }
    }
    if (e.key === 'Escape') setIsEditing(false);
  }

  return (
    <div
      className={cn(
        'group flex gap-2.5 px-4 py-2 hover:bg-white/[0.03] transition-colors',
        isReply && 'pl-12',
        comment.resolved && 'opacity-60'
      )}
    >
      {/* Avatar */}
      <Avatar className="w-8 h-8 mt-0.5 shrink-0">
        <AvatarFallback
          className="text-[11px] font-semibold bg-[#4a154b] text-white"
          style={{ backgroundColor: getNameColor(comment.authorId) + '33', color: getNameColor(comment.authorId) }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[13px] font-semibold" style={{ color: getNameColor(comment.authorId) }}>
            {displayName}
          </span>
          <span className="text-[11px] text-slate-500">{timeAgo}</span>
          {comment.resolved && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
              resolved
            </span>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="space-y-1.5">
            <textarea
              className="w-full bg-[#222529] border border-white/20 rounded-md p-2 text-white text-[13px] resize-none focus:outline-none focus:border-[#4a154b] min-h-[56px]"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (editValue.trim()) {
                    onEditSave(editValue.trim());
                    setIsEditing(false);
                  }
                }}
                className="px-2.5 py-0.5 rounded bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-0.5 rounded text-slate-400 hover:text-white text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[#d1d2d3] text-[13px] leading-relaxed break-words whitespace-pre-wrap">
            {extractContent(comment.content)}
          </p>
        )}

        {/* Actions row */}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onToggleResolved}
              title={comment.resolved ? 'Reopen' : 'Mark as resolved'}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-green-400 transition-colors"
            >
              {comment.resolved ? (
                <CheckCircle className="w-3 h-3 text-green-400" />
              ) : (
                <Circle className="w-3 h-3" />
              )}
              {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
            {!isReply && (
              <button
                onClick={onReply}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors"
              >
                <Reply className="w-3 h-3" />
                Reply
              </button>
            )}
            {isOwn && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ComposerProps {
  blockId: string;
  threadId?: string;
  placeholder?: string;
  onSend: (content: string, threadId?: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}

function Composer({ blockId, threadId, placeholder = 'Add a comment…', onSend, onCancel, autoFocus }: ComposerProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed, threadId);
      setValue('');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="px-4 py-3 border-t border-white/10 bg-[#1a1d21]">
      <textarea
        ref={textareaRef}
        className="w-full bg-[#222529] border border-white/15 rounded-lg px-3 py-2 text-white text-[13px] resize-none focus:outline-none focus:border-[#4a154b] min-h-[64px] placeholder:text-slate-600"
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={sending}
        autoFocus={autoFocus}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-slate-600">Enter to send · Shift+Enter for newline</span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!value.trim() || sending}
            className="px-3 py-1 rounded bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BlockCommentsPanel({ blockId, onClose }: BlockCommentsPanelProps) {
  const { user } = useAuth();
  const { comments, isLoading, createComment, updateComment, deleteComment, toggleResolved, replyTo, byThread } =
    useComments(blockId);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const threads = byThread();
  const threadEntries = Array.from(threads.entries());

  const unresolvedThreads = threadEntries.filter(([, msgs]) => !msgs[0].resolved);
  const resolvedThreads = threadEntries.filter(([, msgs]) => msgs[0].resolved);

  async function handleSendComment(content: string) {
    await createComment({ blockId, content });
  }

  async function handleSendReply(content: string, threadId?: string) {
    if (threadId) {
      await replyTo(threadId, content);
    }
    setReplyingTo(null);
  }

  return (
    <div className="flex flex-col h-full bg-[#1a1d21] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <span className="text-[15px] font-semibold">Comments</span>
          {comments.length > 0 && (
            <span className="text-[11px] text-slate-500 bg-white/8 px-1.5 rounded-full">
              {comments.length}
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close comments"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">Loading comments…</div>
        )}

        {!isLoading && comments.length === 0 && (
          <div className="px-4 py-8 text-center">
            <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No comments yet</p>
            <p className="text-slate-600 text-xs mt-0.5">Be the first to comment on this block</p>
          </div>
        )}

        {/* Unresolved threads */}
        {unresolvedThreads.map(([rootId, msgs]) => {
          const [root, ...replies] = msgs;
          return (
            <div key={rootId} className="border-b border-white/5">
              <CommentRow
                comment={root}
                currentUserId={user?.id}
                onReply={() => setReplyingTo(replyingTo === rootId ? null : rootId)}
                onToggleResolved={() => toggleResolved(root.id)}
                onDelete={() => deleteComment(root.id)}
                onEditSave={(content) => updateComment(root.id, { content })}
              />
              {replies.map(reply => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  currentUserId={user?.id}
                  isReply
                  onReply={() => setReplyingTo(rootId)}
                  onToggleResolved={() => toggleResolved(reply.id)}
                  onDelete={() => deleteComment(reply.id)}
                  onEditSave={(content) => updateComment(reply.id, { content })}
                />
              ))}
              {replyingTo === rootId && (
                <div className="pl-12 pr-4 pb-3">
                  <Composer
                    blockId={blockId}
                    threadId={rootId}
                    placeholder="Reply…"
                    onSend={handleSendReply}
                    onCancel={() => setReplyingTo(null)}
                    autoFocus
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Resolved threads */}
        {resolvedThreads.length > 0 && (
          <div className="border-t border-white/10 mt-2">
            <button
              onClick={() => setShowResolved(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showResolved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showResolved ? 'Hide' : 'Show'} {resolvedThreads.length} resolved{' '}
              {resolvedThreads.length === 1 ? 'thread' : 'threads'}
            </button>
            {showResolved &&
              resolvedThreads.map(([rootId, msgs]) => {
                const [root, ...replies] = msgs;
                return (
                  <div key={rootId} className="border-b border-white/5">
                    <CommentRow
                      comment={root}
                      currentUserId={user?.id}
                      onReply={() => setReplyingTo(replyingTo === rootId ? null : rootId)}
                      onToggleResolved={() => toggleResolved(root.id)}
                      onDelete={() => deleteComment(root.id)}
                      onEditSave={(content) => updateComment(root.id, { content })}
                    />
                    {replies.map(reply => (
                      <CommentRow
                        key={reply.id}
                        comment={reply}
                        currentUserId={user?.id}
                        isReply
                        onReply={() => setReplyingTo(rootId)}
                        onToggleResolved={() => toggleResolved(reply.id)}
                        onDelete={() => deleteComment(reply.id)}
                        onEditSave={(content) => updateComment(reply.id, { content })}
                      />
                    ))}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Sticky composer */}
      <div className="shrink-0">
        <Composer blockId={blockId} onSend={handleSendComment} />
      </div>
    </div>
  );
}
