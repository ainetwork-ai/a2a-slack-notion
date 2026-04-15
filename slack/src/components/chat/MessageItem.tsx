'use client';

import { useState, useEffect, useRef } from 'react';
import { highlightCode } from '@/lib/syntax-highlight';
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

  const highlighted = highlightCode(code, lang);

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
        <code
          className={`text-sm font-mono text-slate-200 whitespace-pre${lang ? ' pt-4 block' : ''}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

function cleanUrlTail(url: string): string {
  // Strip trailing punctuation that's likely not part of the URL (like Slack does)
  return url.replace(/[.,;:!?)]+$/, '');
}

export function renderInlineMarkdown(text: string): string {
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
  let joined = processedLines.join('\n');

  // Extract URLs BEFORE HTML escaping to preserve & and other special chars
  const urlPlaceholders: string[] = [];
  joined = joined.replace(/(https?:\/\/[^\s<>"]+)/g, (_match, rawUrl: string) => {
    const url = cleanUrlTail(rawUrl);
    const trailing = rawUrl.slice(url.length);
    const idx = urlPlaceholders.length;
    urlPlaceholders.push(url);
    return `\x00URL${idx}\x00${trailing}`;
  });

  // HTML escape
  let html = joined
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  html = html.replace(/`([^`]+)`/g, '<code class="bg-white/10 rounded px-1 font-mono text-sm text-slate-200">$1</code>');
  html = html.replace(/\*([^*\n]+)\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/_([^_\n]+)_/g, '<em class="italic">$1</em>');

  // Restore URLs with proper links (original URL in href, escaped version for display)
  html = html.replace(/\x00URL(\d+)\x00/g, (_match, idxStr: string) => {
    const url = urlPlaceholders[parseInt(idxStr)];
    const displayUrl = url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-[#36c5f0] hover:underline">${displayUrl}</a>`;
  });

  // Item 2 & 13: Style @channel/@here/@everyone and regular @mentions
  html = html.replace(/@(channel|here|everyone)\b/g, '<span class="bg-[#4a154b]/30 px-1 rounded text-white font-semibold">@$1</span>');
  html = html.replace(/@([\w-]+)/g, '<span class="text-[#36c5f0] bg-[#36c5f0]/10 px-0.5 rounded cursor-pointer hover:underline">@$1</span>');
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
  return match ? cleanUrlTail(match[1]) : null;
}

interface OGData {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  favicon?: string | null;
}

function OGCard({ url }: { url: string }) {
  const [og, setOg] = useState<OGData | null>(null);
  const [failed, setFailed] = useState(false);
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

  const domain = (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex gap-3 max-w-md bg-white/5 border-l-4 border-[#36c5f0] rounded-r-lg p-3 hover:bg-white/8 transition-colors no-underline"
      onClick={e => e.stopPropagation()}
    >
      {og.image ? (
        <img
          src={og.image}
          alt=""
          className="w-20 h-20 object-cover rounded shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : og.favicon ? (
        <img
          src={og.favicon}
          alt=""
          className="w-8 h-8 rounded shrink-0 mt-0.5"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : null}
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{domain}</p>
        {og.title && <p className="text-sm font-semibold text-[#36c5f0] hover:underline truncate">{og.title}</p>}
        {og.description && <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{og.description}</p>}
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, SmilePlus, MessageSquare, Pencil, Trash2, Pin, Paperclip, Share2, Bookmark, FileText, FileSpreadsheet, FileArchive, File, Copy, Link2, BellOff } from 'lucide-react';
import { Message } from '@/lib/hooks/use-messages';
import ReactionPicker from './ReactionPicker';
import ImageLightbox from './ImageLightbox';
import UserProfilePopup from './UserProfilePopup';
import ShareMessageModal from '@/components/modals/ShareMessageModal';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/stores/app-store';
import { useToast } from '@/components/ui/toast-provider';

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
  const { showToast } = useToast();
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(!!message.pinnedAt);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [animatingReactions, setAnimatingReactions] = useState<Set<string>>(new Set());
  const [shareModalOpen, setShareModalOpen] = useState(false);

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
    // Trigger pop animation
    setAnimatingReactions(prev => new Set(prev).add(emoji));
    setTimeout(() => {
      setAnimatingReactions(prev => {
        const next = new Set(prev);
        next.delete(emoji);
        return next;
      });
    }, 300);

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
      showToast(data.pinned ? 'Message pinned' : 'Message unpinned', 'success');
    }
  }

  async function handleBookmark() {
    if (isBookmarked) {
      await fetch('/api/bookmarks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      });
      setIsBookmarked(false);
      showToast('Bookmark removed', 'info');
    } else {
      await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      });
      setIsBookmarked(true);
      showToast('Message saved', 'success');
    }
  }

  function handleDelete() {
    if (window.confirm("Delete this message? This can't be undone.")) {
      onDelete?.(message.id);
    }
  }

  function handleShare() {
    setShareModalOpen(true);
  }

  function handleCopyText() {
    navigator.clipboard.writeText(message.content).then(() => {
      showToast('Copied to clipboard', 'success');
    });
  }

  function handleCopyLink() {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const path = channelId ? `/workspace/channel/${channelId}` : window.location.pathname;
    const permalink = `${base}${path}#msg-${message.id}`;
    navigator.clipboard.writeText(permalink).then(() => {
      showToast('Copied to clipboard', 'success');
    });
  }

  async function handleMarkUnread() {
    if (!channelId) return;
    // Set lastReadAt to 1ms before this message's timestamp so this message shows as unread
    const ts = new Date(new Date(message.createdAt).getTime() - 1).toISOString();
    await fetch(`/api/channels/${channelId}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: ts }),
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

  const messageTime = format(new Date(message.createdAt), 'h:mm a');

  return (
    <div
      id={`msg-${message.id}`}
      role="article"
      aria-label={`Message from ${senderName} at ${messageTime}`}
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
          {(message.isEdited || message.editedAt) && (
            <Popover>
              <PopoverTrigger className="text-xs text-slate-600 hover:text-slate-400 cursor-pointer bg-transparent border-0 p-0 underline-offset-2 hover:underline">
                (edited)
              </PopoverTrigger>
              <PopoverContent side="top" className="bg-[#1a1d21] border-white/10 text-white p-2 w-auto text-xs">
                {message.editedAt
                  ? `Edited at ${format(new Date(message.editedAt), 'MMM d, yyyy h:mm a')}`
                  : 'This message has been edited'}
              </PopoverContent>
            </Popover>
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
            {firstUrl && (/\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(firstUrl) ? (
              <div
                className="mt-2 cursor-pointer inline-block"
                onClick={() => setLightboxSrc(firstUrl)}
                title="Click to enlarge"
              >
                <img
                  src={firstUrl}
                  alt="Image"
                  className="max-w-[400px] max-h-80 rounded-lg border border-white/10 object-contain hover:opacity-90 transition-opacity"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            ) : (
              <OGCard url={firstUrl} />
            ))}

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
                  const ext = (meta.fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
                  const isPdf = meta.mimeType === 'application/pdf' || ext === 'pdf';
                  const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext) ||
                    (meta.mimeType ?? '').includes('spreadsheet') || (meta.mimeType ?? '').includes('excel');
                  const isArchive = ['zip', 'tar', 'gz'].includes(ext) ||
                    (meta.mimeType ?? '').includes('zip') || (meta.mimeType ?? '').includes('tar') || (meta.mimeType ?? '').includes('gzip');
                  const isDoc = ['doc', 'docx', 'txt', 'ppt', 'pptx'].includes(ext) ||
                    (meta.mimeType ?? '').includes('word') || (meta.mimeType ?? '').includes('presentation') || (meta.mimeType ?? '') === 'text/plain';

                  const FileIcon = isSpreadsheet
                    ? FileSpreadsheet
                    : isArchive
                    ? FileArchive
                    : (isPdf || isDoc)
                    ? FileText
                    : File;

                  const iconColor = isPdf
                    ? 'text-red-400'
                    : isSpreadsheet
                    ? 'text-green-400'
                    : isArchive
                    ? 'text-yellow-400'
                    : isDoc
                    ? 'text-blue-400'
                    : 'text-slate-400';

                  return (
                    <a
                      href={meta.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors max-w-sm"
                    >
                      <FileIcon className={`w-6 h-6 shrink-0 ${iconColor}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{meta.fileName ?? 'File'}</p>
                        <p className="text-xs text-slate-400">
                          {ext ? ext.toUpperCase() : 'File'} · Click to download
                        </p>
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
                const names = reaction.userNames ?? [];
                const otherNames = iReacted
                  ? names.filter((_, i) => reaction.userIds[i] !== currentUserId)
                  : names;
                let tooltipText = '';
                if (iReacted && otherNames.length > 0) {
                  tooltipText = `You, ${otherNames.join(', ')}`;
                } else if (iReacted) {
                  tooltipText = 'You';
                } else if (names.length > 0) {
                  tooltipText = names.join(', ');
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
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10',
                        animatingReactions.has(reaction.emoji) && 'reaction-pop'
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
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'w-7 h-7 hover:bg-white/10',
              isBookmarked ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-400 hover:text-white'
            )}
            onClick={handleBookmark}
            title={isBookmarked ? 'Remove bookmark' : 'Save for later'}
          >
            <Bookmark className={cn('w-3.5 h-3.5', isBookmarked && 'fill-yellow-400')} />
          </Button>
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
              <DropdownMenuItem
                onClick={handleCopyText}
                className="hover:bg-white/10 cursor-pointer"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy text
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCopyLink}
                className="hover:bg-white/10 cursor-pointer"
              >
                <Link2 className="w-4 h-4 mr-2" />
                Copy link to message
              </DropdownMenuItem>
              {channelId && (
                <DropdownMenuItem
                  onClick={handleMarkUnread}
                  className="hover:bg-white/10 cursor-pointer"
                >
                  <BellOff className="w-4 h-4 mr-2" />
                  Mark as unread from here
                </DropdownMenuItem>
              )}
              {isOwn && (
                <>
                  <DropdownMenuItem
                    onClick={() => setIsEditing(true)}
                    className="hover:bg-white/10 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit message
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDelete}
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

      {/* T10: Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* Share message modal */}
      <ShareMessageModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        messageContent={message.content}
        sourceChannelName={channelName}
      />

    </div>
  );
}
