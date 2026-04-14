'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const nameColors = ['#e879f9', '#36c5f0', '#2eb67d', '#ecb22e', '#e01e5a', '#36c5f0', '#ff6b6b', '#4ecdc4'];
function getNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return nameColors[Math.abs(hash) % nameColors.length];
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="relative group/code my-1">
      <pre className="bg-[#222529] p-3 rounded overflow-x-auto">
        {lang && (
          <span className="absolute top-1.5 left-3 text-[10px] text-slate-500 font-mono select-none">
            {lang}
          </span>
        )}
        <button
          onClick={handleCopy}
          className="absolute top-1.5 right-2 text-[10px] text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded px-1.5 py-0.5 opacity-0 group-hover/code:opacity-100 transition-opacity"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <code className={`text-sm font-mono text-slate-200 whitespace-pre${lang ? ' pt-4 block' : ''}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}

function renderInlineMarkdown(text: string): string {
  // Process block quotes before HTML escaping
  const lines = text.split('\n');
  const processedLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('> ')) {
      processedLines.push(`\x00BQSTART\x00${line.slice(2)}\x00BQEND\x00`);
    } else {
      processedLines.push(line);
    }
  }
  let html = processedLines.join('\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  html = html.replace(/`([^`]+)`/g, '<code class="bg-white/10 rounded px-1 font-mono text-sm text-slate-200">$1</code>');
  html = html.replace(/\*([^*\n]+)\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/_([^_\n]+)_/g, '<em class="italic">$1</em>');
  html = html.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#36c5f0] hover:underline">$1</a>');
  // Item 2 & 13: Style @channel/@here/@everyone and regular @mentions
  html = html.replace(/@(channel|here|everyone)\b/g, '<span class="bg-[#4a154b]/30 px-1 rounded text-white font-semibold">@$1</span>');
  html = html.replace(/@(\w+)/g, '<span class="text-[#36c5f0] bg-[#36c5f0]/10 px-0.5 rounded cursor-pointer hover:underline">@$1</span>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/\x00BQSTART\x00([\s\S]*?)\x00BQEND\x00/g, '<blockquote class="border-l-4 border-[#4a154b] pl-3 text-slate-400 bg-white/5 my-0.5">$1</blockquote>');
  return html;
}

function renderMessageContent(content: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before) parts.push(<span key={`t-${lastIndex}`} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(before) }} />);
    const lang = match[1] || '';
    const code = match[2];
    parts.push(<CodeBlock key={`c-${match.index}`} lang={lang} code={code} />);
    lastIndex = match.index + match[0].length;
  }

  const remaining = content.slice(lastIndex);
  if (remaining) parts.push(<span key={`t-end`} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(remaining) }} />);

  return <>{parts}</>;
}

function extractFirstUrl(content: string): string | null {
  const match = content.match(/(https?:\/\/[^\s<>"]+)/);
  return match ? match[1] : null;
}

interface OGData {
  title?: string | null;
  description?: string | null;
  image?: string | null;
}

function OGCard({ url }: { url: string }) {
  const [og, setOg] = useState<OGData | null>(null);
  const [failed, setFailed] = useState(false);
  // Simple client-side cache via module-level map
  const cacheKey = url;

  useEffect(() => {
    if (ogCache.has(cacheKey)) {
      const cached = ogCache.get(cacheKey)!;
      if (cached === 'failed') { setFailed(true); return; }
      setOg(cached);
      return;
    }
    fetch(`/api/og?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error || (!data.title && !data.description)) {
          ogCache.set(cacheKey, 'failed');
          setFailed(true);
          return;
        }
        ogCache.set(cacheKey, data);
        setOg(data);
      })
      .catch(() => {
        ogCache.set(cacheKey, 'failed');
        setFailed(true);
      });
  }, [cacheKey, url]);

  if (failed || !og) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex gap-3 max-w-sm bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/8 transition-colors no-underline"
      onClick={e => e.stopPropagation()}
    >
      {og.image && (
        <img
          src={og.image}
          alt=""
          className="w-16 h-16 object-cover rounded shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="min-w-0">
        {og.title && <p className="text-sm font-semibold text-white truncate">{og.title}</p>}
        {og.description && <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{og.description}</p>}
        <p className="text-xs text-[#36c5f0] truncate mt-1">{url}</p>
      </div>
    </a>
  );
}

// Module-level OG cache
const ogCache = new Map<string, OGData | 'failed'>();

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, SmilePlus, MessageSquare, Pencil, Trash2, Pin, Paperclip, Share2 } from 'lucide-react';
import { Message } from '@/lib/hooks/use-messages';
import ReactionPicker from './ReactionPicker';
import ImageLightbox from './ImageLightbox';
import UserProfilePopup from './UserProfilePopup';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/stores/app-store';

interface MessageItemProps {
  message: Message;
  currentUserId?: string;
  currentUserName?: string;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  isThreadView?: boolean;
  isCompact?: boolean;
  channelName?: string;
  channelId?: string;
}

export default function MessageItem({
  message,
  currentUserId,
  currentUserName,
  onEdit,
  onDelete,
  isThreadView,
  isCompact,
  channelName,
  channelId,
}: MessageItemProps) {
  const { setActiveThread } = useAppStore();
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPinned, setIsPinned] = useState(!!message.pinnedAt);

  const isOwn = message.senderId === currentUserId;
  const senderName = message.senderName || 'Unknown';
  const initials = senderName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isAgentResponse = message.contentType === 'agent-response';
  const isSystemMessage = message.contentType === 'system';

  // Item 3: Check if current user is mentioned
  const isMentioned = !!(currentUserName && message.content.includes(`@${currentUserName}`));

  // Extract first URL for OG preview
  const firstUrl = extractFirstUrl(message.content);

  function handleEdit() {
    if (!onEdit) return;
    onEdit(message.id, editContent);
    setIsEditing(false);
  }

  async function handleReaction(emoji: string) {
    await fetch(`/api/messages/${message.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
  }

  async function handlePin() {
    const res = await fetch(`/api/messages/${message.id}/pin`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setIsPinned(data.pinned);
    }
  }

  function handleConfirmDelete() {
    onDelete?.(message.id);
    setDeleteDialogOpen(false);
  }

  function handleShare() {
    const channelPart = channelName ? `[#${channelName}] ` : '';
    const text = `${channelPart}${senderName}: ${message.content}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(true);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => setCopyToast(false), 2500);
    });
  }

  // Item 7: Timestamp permalink
  const [timestampToast, setTimestampToast] = useState(false);
  const timestampToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTimestampClick() {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const path = channelId ? `/workspace/channel/${channelId}` : window.location.pathname;
    const permalink = `${base}${path}#msg-${message.id}`;
    navigator.clipboard.writeText(permalink).then(() => {
      setTimestampToast(true);
      if (timestampToastRef.current) clearTimeout(timestampToastRef.current);
      timestampToastRef.current = setTimeout(() => setTimestampToast(false), 2000);
    });
  }

  // Item 4: System message rendering
  if (isSystemMessage) {
    return (
      <div id={`msg-${message.id}`} className="flex items-center justify-center py-1 px-4">
        <span className="text-xs text-slate-500 italic">{message.content}</span>
      </div>
    );
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        'group relative flex items-start gap-3 px-4 hover:bg-white/[0.03] rounded-lg transition-colors',
        isCompact ? 'py-0.5' : 'py-1.5',
        isAgentResponse && 'bg-[#36c5f0]/5 border-l-2 border-[#36c5f0]/30',
        isMentioned && 'border-l-4 border-yellow-500 bg-yellow-500/5'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar — hidden in compact mode, replaced by left padding */}
      {isCompact ? (
        <div className="w-9 shrink-0" />
      ) : (
        <Avatar className="w-9 h-9 mt-0.5 shrink-0">
          {message.senderAvatar && (
            <AvatarImage src={message.senderAvatar} alt={senderName} />
          )}
          <AvatarFallback className={cn(
            'text-xs font-semibold',
            message.isAgent ? 'bg-[#36c5f0]/20 text-[#36c5f0]' : 'bg-[#4a154b] text-white'
          )}>
            {initials}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0">
        {/* Header — hidden in compact mode */}
        {!isCompact && (
        <div className="flex items-center gap-2 mb-0.5">
          <UserProfilePopup
            userId={message.senderId}
            displayName={senderName}
            avatarUrl={message.senderAvatar}
            isAgent={message.isAgent}
          >
            <button className="font-semibold text-sm hover:underline cursor-pointer" style={{ color: getNameColor(senderName) }}>{senderName}</button>
          </UserProfilePopup>
          {message.isAgent && (
            <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30">
              Bot
            </Badge>
          )}
          <button
            onClick={handleTimestampClick}
            className="text-xs text-slate-500 hover:text-slate-300 hover:underline relative"
            title="Copy link to message"
          >
            {format(new Date(message.createdAt), 'h:mm a')}
            {timestampToast && (
              <span className="absolute left-0 -top-6 bg-[#36c5f0] text-[#1a1d21] text-xs font-medium px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none z-20">
                Link copied!
              </span>
            )}
          </button>
          {message.editedAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="text-xs text-slate-600 cursor-default bg-transparent border-0 p-0">
                  (edited)
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a1d21] text-white border-white/10 text-xs">
                  Edited {format(new Date(message.editedAt), 'MMM d, yyyy h:mm a')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isPinned && (
            <span className="pin-indicator flex items-center gap-0.5 text-xs" title="Pinned message">
              <Pin className="w-3 h-3" />
            </span>
          )}
        </div>
        )}
        {/* Compact mode: show time on hover */}
        {isCompact && (
          <span className="absolute left-4 top-1 text-[10px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity select-none pointer-events-none">
            {format(new Date(message.createdAt), 'h:mm a')}
          </span>
        )}

        {/* Content */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              className="w-full bg-[#222529] border border-white/20 rounded-lg p-2 text-white text-sm resize-none focus:outline-none focus:border-[#4a154b] min-h-[60px]"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEdit();
                }
                if (e.key === 'Escape') setIsEditing(false);
              }}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleEdit}
                className="h-7 px-3 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(false)}
                className="h-7 px-3 text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-slate-200 text-sm leading-relaxed break-words">
              {renderMessageContent(message.content)}
            </p>

            {/* OG link preview — T6 */}
            {firstUrl && <OGCard url={firstUrl} />}

            {message.metadata && typeof message.metadata === 'object' && 'fileUrl' in message.metadata && (
              <div className="mt-2">
                {(() => {
                  const meta = message.metadata as { fileUrl: string; fileName?: string; mimeType?: string };
                  const isImage = meta.mimeType?.startsWith('image/');
                  if (isImage) {
                    return (
                      <div
                        className="cursor-pointer inline-block"
                        onClick={() => setLightboxSrc(meta.fileUrl)}
                        title="Click to enlarge"
                      >
                        <img
                          src={meta.fileUrl}
                          alt={meta.fileName ?? 'attachment'}
                          className="max-w-xs max-h-64 rounded-lg border border-white/10 object-contain hover:opacity-90 transition-opacity"
                        />
                      </div>
                    );
                  }
                  return (
                    <a
                      href={meta.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors max-w-sm"
                    >
                      <Paperclip className="w-5 h-5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{meta.fileName ?? 'File'}</p>
                        <p className="text-xs text-slate-400">Click to download</p>
                      </div>
                    </a>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Reactions — T8: tooltip showing who reacted */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <TooltipProvider>
              {message.reactions.map(reaction => {
                const iReacted = reaction.userIds.includes(currentUserId ?? '');
                const othersCount = iReacted ? reaction.count - 1 : reaction.count;
                let tooltipText = '';
                if (iReacted && othersCount > 0) {
                  tooltipText = `You and ${othersCount} other${othersCount > 1 ? 's' : ''}`;
                } else if (iReacted) {
                  tooltipText = 'You';
                } else {
                  tooltipText = `${reaction.count} person${reaction.count > 1 ? 's' : ''}`;
                }

                return (
                  <Tooltip key={reaction.emoji}>
                    <TooltipTrigger
                      onClick={() => handleReaction(reaction.emoji)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors',
                        iReacted
                          ? 'bg-[#4a154b]/30 border-[#4a154b]/60 text-white'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      )}
                    >
                      <span>{reaction.emoji}</span>
                      <span>{reaction.count}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {tooltipText} reacted with {reaction.emoji}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        )}

        {/* Thread count */}
        {!isThreadView && message.threadCount && message.threadCount > 0 ? (
          <button
            onClick={() => setActiveThread(message.id)}
            className="flex items-center gap-1.5 mt-1.5 text-xs text-[#36c5f0] hover:text-[#36c5f0]/80 hover:underline"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
          </button>
        ) : null}
      </div>

      {/* Hover Actions */}
      {showActions && !isEditing && (
        <div className="absolute -top-3 right-4 flex items-center gap-1 bg-[#222529] border border-white/10 rounded-lg shadow-lg p-0.5 z-10">
          <ReactionPicker
            onSelect={handleReaction}
            open={reactionPickerOpen}
            onOpenChange={setReactionPickerOpen}
          />
          {!isThreadView && (
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/10"
              onClick={() => setActiveThread(message.id)}
              title="Reply in thread"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#222529] border-white/10 text-white">
              <DropdownMenuItem
                onClick={handlePin}
                className="hover:bg-white/10 cursor-pointer"
              >
                <Pin className="w-4 h-4 mr-2" />
                {isPinned ? 'Unpin message' : 'Pin message'}
              </DropdownMenuItem>
              {/* T13: Share message */}
              <DropdownMenuItem
                onClick={handleShare}
                className="hover:bg-white/10 cursor-pointer"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share message
              </DropdownMenuItem>
              {isOwn && (
                <>
                  <DropdownMenuItem
                    onClick={() => setIsEditing(true)}
                    className="hover:bg-white/10 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit message
                  </DropdownMenuItem>
                  {/* T7: Delete with confirmation */}
                  <DropdownMenuItem
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-red-400 hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete message
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* T7: Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#222529] border-white/10 text-white sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-white">Delete message?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400">
            Are you sure you want to delete this message? This can&apos;t be undone.
          </p>
          <DialogFooter className="border-t-white/10 bg-transparent -mx-0 -mb-0 rounded-b-none pt-2 flex-row justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              className="text-slate-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* T10: Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* T13: Copy toast */}
      {copyToast && (
        <div className="absolute right-2 -top-8 z-20 bg-[#36c5f0] text-[#1a1d21] text-xs font-medium px-2 py-1 rounded shadow-lg pointer-events-none">
          Copied to clipboard
        </div>
      )}
    </div>
  );
}
