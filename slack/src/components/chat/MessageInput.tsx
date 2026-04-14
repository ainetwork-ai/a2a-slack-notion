'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, Send, Bold, Italic, Strikethrough, Code, List, Quote, Smile, AtSign, Clock } from 'lucide-react';
import { useTyping } from '@/lib/realtime/use-typing';
import { cn } from '@/lib/utils';
import { replaceShortcodes } from '@/lib/emoji-map';
import { commands, findCommand } from '@/lib/slash-commands';
import ReactionPicker from './ReactionPicker';

interface MessageInputProps {
  onSend: (content: string, metadata?: Record<string, unknown>) => Promise<void>;
  placeholder?: string;
  channelId?: string;
  conversationId?: string;
  disabled?: boolean;
}

interface MentionSuggestion {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export default function MessageInput({
  onSend,
  placeholder = 'Message...',
  channelId,
  conversationId,
  disabled,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ fileName: string; url: string; mimeType: string } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashSuggestions, setSlashSuggestions] = useState<typeof commands>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [ephemeralMessage, setEphemeralMessage] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  // Item 10: Shift+Enter hint
  const [showShiftEnterHint, setShowShiftEnterHint] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('shiftEnterHintDismissed');
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const { reportTyping, stopTyping } = useTyping(channelId, conversationId);

  // Issue 3: Focus textarea when sending completes
  useEffect(() => {
    if (!isSending) {
      textareaRef.current?.focus();
    }
  }, [isSending]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function applyFormat(marker: string, linePrefix?: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);

    let newContent: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    if (linePrefix !== undefined) {
      // Line-based formatting (list, quote)
      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      const prefix = linePrefix;
      newContent = content.slice(0, lineStart) + prefix + content.slice(lineStart);
      newCursorStart = start + prefix.length;
      newCursorEnd = end + prefix.length;
    } else if (selected) {
      // Wrap selection
      newContent = content.slice(0, start) + marker + selected + marker + content.slice(end);
      newCursorStart = start + marker.length;
      newCursorEnd = end + marker.length;
    } else {
      // No selection: insert markers and place cursor between them
      newContent = content.slice(0, start) + marker + marker + content.slice(start);
      newCursorStart = start + marker.length;
      newCursorEnd = start + marker.length;
    }

    setContent(newContent);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newCursorStart, newCursorEnd);
      autoResize();
    }, 0);
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const newContent = before + text + after;
    setContent(newContent);
    setTimeout(() => {
      el?.focus();
      const newPos = pos + text.length;
      el?.setSelectionRange(newPos, newPos);
      autoResize();
    }, 0);
  }

  function handleEmojiSelect(emoji: string) {
    insertAtCursor(emoji);
  }

  function handleMentionButton() {
    insertAtCursor('@');
    // Trigger handleChange logic by simulating input — we update state then trigger fetch
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? content.length;
    const newContent = content.slice(0, pos) + '@' + content.slice(pos);
    // fetchMentions with empty query
    fetchMentions('');
    setMentionQuery('');
    setMentionIndex(0);
    setTimeout(() => el?.focus(), 0);
  }

  async function handleSend() {
    const trimmed = content.trim();
    if ((!trimmed && !pendingFile) || isSending) return;

    // Slash command interception
    if (trimmed.startsWith('/')) {
      const match = findCommand(trimmed);
      if (match) {
        setIsSending(true);
        try {
          await stopTyping();
          const result = await match.command.execute(match.args, { channelId, conversationId });
          if (result.ephemeral) {
            setEphemeralMessage(result.response);
            setTimeout(() => setEphemeralMessage(null), 8000);
          } else {
            await onSend(result.response);
          }
          setContent('');
          setSlashSuggestions([]);
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        } catch {
          // keep content on failure
        } finally {
          setIsSending(false);
        }
        return;
      }
    }

    setIsSending(true);
    try {
      await stopTyping();
      if (pendingFile) {
        const messageContent = replaceShortcodes(trimmed || `[${pendingFile.fileName}](${pendingFile.url})`);
        await onSend(messageContent, { fileUrl: pendingFile.url, fileName: pendingFile.fileName, mimeType: pendingFile.mimeType });
        setPendingFile(null);
      } else {
        await onSend(replaceShortcodes(trimmed));
      }
      setContent('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      // Item 1: Check for @mentions of non-members in channel messages
      if (channelId) {
        const mentionMatches = trimmed.match(/@(\w+)/g);
        if (mentionMatches) {
          try {
            const res = await fetch(`/api/channels/${channelId}/members`);
            if (res.ok) {
              const members: Array<{ displayName: string }> = await res.json();
              const memberNames = new Set(members.map(m => m.displayName.toLowerCase()));
              const nonMembers = mentionMatches
                .map(m => m.slice(1))
                .filter(name => !['channel', 'here', 'everyone'].includes(name.toLowerCase()) && !memberNames.has(name.toLowerCase()));
              if (nonMembers.length > 0) {
                const name = nonMembers[0];
                setEphemeralMessage(`${name} is not in this channel. /invite @${name} to add them.`);
                setTimeout(() => setEphemeralMessage(null), 8000);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // keep content on failure
    } finally {
      setIsSending(false);
    }
  }

  async function fetchMentions(query: string) {
    try {
      // Search all workspace users, not just channel members
      const endpoint = `/api/users/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const data = await res.json();
      const suggestions = Array.isArray(data) ? data : (data.members ?? data.participants ?? []);
      setMentionSuggestions(suggestions.map((u: Record<string, unknown>) => ({
        id: u.id || u.userId,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
      })));
    } catch {
      setMentionSuggestions([]);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    autoResize();
    reportTyping();

    // Slash command detection (only when input starts with /)
    if (val.startsWith('/') && !val.includes(' ')) {
      const query = val.toLowerCase();
      const matches = commands.filter(cmd => cmd.name.startsWith(query));
      setSlashSuggestions(matches);
      setSlashIndex(0);
      setMentionSuggestions([]);
      setMentionQuery('');
      return;
    } else {
      setSlashSuggestions([]);
    }

    // Mention detection
    const cursor = e.target.selectionStart ?? 0;
    const textBefore = val.slice(0, cursor);
    const mentionMatch = textBefore.match(/@(\w*)$/);
    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      setMentionIndex(0);
      fetchMentions(query);
    } else {
      setMentionSuggestions([]);
      setMentionQuery('');
    }
  }

  function insertMention(user: MentionSuggestion) {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    const newBefore = before.replace(/@\w*$/, `@${user.displayName} `);
    setContent(newBefore + after);
    setMentionSuggestions([]);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = newBefore.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function insertSlashCommand(cmd: typeof commands[number]) {
    setContent(cmd.name + ' ');
    setSlashSuggestions([]);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = cmd.name.length + 1;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isComposingRef.current) return;

    if (slashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(i => Math.min(i + 1, slashSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSlashCommand(slashSuggestions[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setSlashSuggestions([]);
        return;
      }
    }

    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionSuggestions([]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    // Item 10: Dismiss Shift+Enter hint on first use
    if (e.key === 'Enter' && e.shiftKey && showShiftEnterHint) {
      setShowShiftEnterHint(false);
      localStorage.setItem('shiftEnterHintDismissed', '1');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { url, fileName, mimeType } = await res.json();
      setPendingFile({ url, fileName, mimeType });
    } catch {
      // Silently fail for now
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function uploadFile(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { url, fileName, mimeType } = await res.json();
      setPendingFile({ url, fileName, mimeType });
    } catch {
      // Silently fail
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      uploadFile(file);
    }
  }

  const toolbarButtons = [
    { icon: Bold, label: 'Bold', action: () => applyFormat('*') },
    { icon: Italic, label: 'Italic', action: () => applyFormat('_') },
    { icon: Strikethrough, label: 'Strikethrough', action: () => applyFormat('~') },
    { icon: Code, label: 'Code', action: () => applyFormat('`') },
    { icon: List, label: 'List', action: () => applyFormat('', '• ') },
    { icon: Quote, label: 'Quote', action: () => applyFormat('', '> ') },
  ];

  const hasContent = !!(content.trim() || pendingFile);

  return (
    <div className="relative px-4 pb-4">
      {/* Pending file preview */}
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 bg-[#222529] border border-white/10 rounded-lg px-3 py-2">
          <span className="text-slate-300 text-xs truncate flex-1">{pendingFile.fileName}</span>
          <button
            onClick={() => setPendingFile(null)}
            className="text-slate-500 hover:text-white text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Ephemeral message */}
      {ephemeralMessage && (
        <div className="mb-2 flex items-start gap-2 bg-[#222529] border border-yellow-500/30 rounded-lg px-3 py-2">
          <span className="text-yellow-400 text-xs shrink-0 mt-0.5">Only visible to you</span>
          <span className="text-slate-300 text-xs flex-1 whitespace-pre-wrap">{ephemeralMessage}</span>
          <button
            onClick={() => setEphemeralMessage(null)}
            className="text-slate-500 hover:text-white text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Slash command suggestions */}
      {slashSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          {slashSuggestions.map((cmd, i) => (
            <button
              key={cmd.name}
              onClick={() => insertSlashCommand(cmd)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                i === slashIndex ? 'bg-[#4a154b]/50 text-white' : 'text-slate-300 hover:bg-white/5'
              )}
            >
              <span className="font-mono font-semibold text-white/90">{cmd.name}</span>
              <span className="text-slate-400 text-xs">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Mention suggestions */}
      {mentionSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          {mentionSuggestions.map((user, i) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                i === mentionIndex ? 'bg-[#4a154b]/50 text-white' : 'text-slate-300 hover:bg-white/5'
              )}
            >
              <span className="font-medium">@{user.displayName}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={cn('message-input-container bg-[#222529] border rounded-xl overflow-hidden', isDragging ? 'border-2 border-dashed border-[#4a154b]' : 'border-white/10')}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {/* Top row: paperclip + textarea */}
        <div className="flex items-start gap-2 px-2 pt-2">
          {/* File attachment */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/10 shrink-0 mt-0.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            placeholder={placeholder}
            disabled={disabled || isSending}
            rows={1}
            autoFocus
            className="flex-1 bg-transparent text-white placeholder:text-slate-500 text-sm resize-none focus:outline-none leading-relaxed py-1 max-h-[200px] overflow-y-auto"
          />
        </div>

        {/* Bottom row: formatting buttons + spacer + action buttons */}
        <div className="flex items-center px-2 pb-2 pt-1">
          {/* Formatting buttons */}
          {toolbarButtons.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onMouseDown={e => {
                e.preventDefault(); // prevent textarea blur
                action();
              }}
              title={label}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Emoji picker button */}
          <ReactionPicker
            onSelect={handleEmojiSelect}
            open={emojiPickerOpen}
            onOpenChange={setEmojiPickerOpen}
            triggerIcon={<Smile className="w-4 h-4" />}
            triggerTitle="Add emoji"
            triggerClassName="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          />

          {/* @mention button */}
          <button
            onMouseDown={e => {
              e.preventDefault();
              handleMentionButton();
            }}
            title="Mention someone"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <AtSign className="w-4 h-4" />
          </button>

          {/* Schedule button */}
          <div className="relative">
            <button
              title="Schedule message"
              onClick={() => setScheduleOpen(!scheduleOpen)}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Clock className="w-4 h-4" />
            </button>
            {scheduleOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                <p className="px-3 py-1.5 text-[11px] text-slate-500 font-semibold uppercase">Schedule send</p>
                {[
                  { label: 'In 30 minutes', ms: 30 * 60 * 1000 },
                  { label: 'In 1 hour', ms: 60 * 60 * 1000 },
                  { label: 'In 3 hours', ms: 3 * 60 * 60 * 1000 },
                ].map(opt => (
                  <button
                    key={opt.label}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                    onClick={async () => {
                      const msg = content.trim();
                      if (!msg) { setScheduleOpen(false); return; }
                      setScheduleOpen(false);
                      setContent('');
                      if (textareaRef.current) textareaRef.current.style.height = 'auto';
                      const time = new Date(Date.now() + opt.ms);
                      setEphemeralMessage(`Message scheduled for ${time.toLocaleTimeString()}`);
                      setTimeout(() => setEphemeralMessage(null), 5000);
                      setTimeout(async () => { await onSend(replaceShortcodes(msg)); }, opt.ms);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send button — always visible */}
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!hasContent || isSending || disabled}
            className={cn(
              'w-7 h-7 shrink-0 transition-colors ml-0.5',
              hasContent
                ? 'bg-[#007a5a] hover:bg-[#148567] text-white'
                : 'bg-transparent text-slate-600 cursor-default'
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Item 10: Shift+Enter hint */}
      {showShiftEnterHint && (
        <p className="mt-1 px-1 text-[11px] text-slate-600">
          Tip: <kbd className="bg-white/10 px-1 rounded text-slate-500">Shift+Enter</kbd> for new line
        </p>
      )}
    </div>
  );
}
