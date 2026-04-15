'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Paperclip, Send, Bold, Italic, Strikethrough, Code, List, Quote, Smile, AtSign, Clock, Eye, EyeOff, Link, ListOrdered, CodeSquare } from 'lucide-react';
import { useTyping } from '@/lib/realtime/use-typing';
import { cn } from '@/lib/utils';
import { replaceShortcodes, emojiMap } from '@/lib/emoji-map';
import { htmlToMarkdown, normalizeMarkdown } from '@/lib/html-to-markdown';
import { commands, findCommand, findCustomCommand } from '@/lib/slash-commands';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import ReactionPicker from './ReactionPicker';
import GifPicker from './GifPicker';
import { renderInlineMarkdown } from './MessageItem';

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
  statusMessage?: string;
  isOnline?: boolean;
}

// Build emoji suggestions list from the emoji map
const EMOJI_SHORTCODES: Array<{ shortcode: string; emoji: string }> = Object.entries(emojiMap).map(
  ([key, emoji]) => ({ shortcode: key.slice(1, -1), emoji }) // strip leading/trailing ':'
);

export default function MessageInput({
  onSend,
  placeholder = 'Message...',
  channelId,
  conversationId,
  disabled,
}: MessageInputProps) {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ fileName: string; url: string; mimeType: string; size: number } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashSuggestions, setSlashSuggestions] = useState<Array<{ name: string; description: string }>>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [emojiSuggestions, setEmojiSuggestions] = useState<Array<{ shortcode: string; emoji: string }>>([]);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [skillSuggestions, setSkillSuggestions] = useState<Array<{ name: string; description: string; skillId: string }>>([]);
  const [skillIndex, setSkillIndex] = useState(0);
  const [ephemeralMessage, setEphemeralMessage] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  // Item 10: Shift+Enter hint
  const [showShiftEnterHint, setShowShiftEnterHint] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('shiftEnterHintDismissed');
  });
  const [previewVisible, setPreviewVisible] = useState(false);

  // Show preview only when content contains formatting characters
  const hasFormatting = /[*_`~>]/.test(content);
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

  async function handleGifSelect(url: string) {
    setIsSending(true);
    try {
      await stopTyping();
      await onSend(url);
    } catch {
      // keep content on failure
    } finally {
      setIsSending(false);
    }
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
      const match = findCommand(trimmed) ||
        (activeWorkspaceId ? await findCustomCommand(trimmed, activeWorkspaceId) : null);
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
        const mentionMatches = trimmed.match(/@([\w-]+)/g);
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
        avatarUrl: u.avatarUrl as string | undefined,
        statusMessage: u.statusMessage as string | undefined,
        isOnline: u.isOnline as boolean | undefined,
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
    if (val.startsWith('/')) {
      const query = val.toLowerCase();

      // MCP sub-command suggestions: "/mcp " or "/mcp p..."
      if (query.startsWith('/mcp ')) {
        const sub = query.slice(5); // after "/mcp "
        (async () => {
          try {
            const res = await fetch('/api/mcp/servers');
            if (!res.ok) return;
            const servers: Array<{ id: string; name: string; icon: string; tools: Array<{ name: string; description: string }> }> = await res.json();
            const mcpSuggestions: Array<{ name: string; description: string }> = [];
            for (const s of servers) {
              for (const t of s.tools) {
                const full = `/mcp ${s.id} ${t.name}`;
                if (full.startsWith(query) || !sub.trim()) {
                  mcpSuggestions.push({ name: full, description: `${s.icon} ${t.description}` });
                }
              }
            }
            setSlashSuggestions(mcpSuggestions);
            setSlashIndex(0);
          } catch { /* ignore */ }
        })();
        setMentionSuggestions([]);
        setMentionQuery('');
        return;
      }

      // Built-in command suggestions (no space yet)
      if (!val.includes(' ')) {
        const matches = commands.filter(cmd => cmd.name.startsWith(query));
        setSlashSuggestions(matches);
        setSlashIndex(0);
        setMentionSuggestions([]);
        setMentionQuery('');
        return;
      }

      setSlashSuggestions([]);
    } else {
      setSlashSuggestions([]);
    }

    // Agent skill detection: "@AgentName <partial>" pattern
    const agentSkillMatch = val.match(/^@([\w\s()-]+?)\s+(.*)$/);
    if (agentSkillMatch && !val.startsWith('/')) {
      const agentName = agentSkillMatch[1].trim();
      const skillQuery = agentSkillMatch[2].toLowerCase();
      (async () => {
        try {
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(agentName)}`);
          if (!res.ok) return;
          const users: Array<{ id: string; displayName: string; isAgent?: boolean }> = await res.json();
          const agent = users.find(u => u.isAgent && u.displayName.toLowerCase() === agentName.toLowerCase());
          if (!agent) { setSkillSuggestions([]); return; }
          const agentRes = await fetch(`/api/agents/${agent.id}`);
          if (!agentRes.ok) { setSkillSuggestions([]); return; }
          const agentData = await agentRes.json();
          const skills = (agentData.agentCardJson?.skills || []) as Array<{ id: string; name: string; description: string }>;
          const filtered = skills
            .filter(s => s.id !== 'chat')
            .filter(s => !skillQuery || s.id.includes(skillQuery) || s.name.toLowerCase().includes(skillQuery) || s.description?.toLowerCase().includes(skillQuery))
            .map(s => ({ name: `@${agentName} ${s.id}`, description: s.description || s.name, skillId: s.id }));
          setSkillSuggestions(filtered);
          setSkillIndex(0);
        } catch { setSkillSuggestions([]); }
      })();
      setMentionSuggestions([]);
      setMentionQuery('');
      return;
    } else {
      setSkillSuggestions([]);
    }

    // Mention detection
    const cursor = e.target.selectionStart ?? 0;
    const textBefore = val.slice(0, cursor);
    const mentionMatch = textBefore.match(/@([\w-]*)$/);
    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      setMentionIndex(0);
      fetchMentions(query);
      setEmojiSuggestions([]);
      setEmojiQuery('');
    } else {
      setMentionSuggestions([]);
      setMentionQuery('');
    }

    // Emoji shortcode detection: colon followed by 2+ word chars
    const emojiMatch = textBefore.match(/:(\w{2,})$/);
    if (emojiMatch && !mentionMatch) {
      const query = emojiMatch[1].toLowerCase();
      setEmojiQuery(query);
      setEmojiIndex(0);
      const matches = EMOJI_SHORTCODES.filter(e => e.shortcode.includes(query)).slice(0, 8);
      setEmojiSuggestions(matches);
    } else if (!emojiMatch) {
      setEmojiSuggestions([]);
      setEmojiQuery('');
    }
  }

  function insertMention(user: MentionSuggestion) {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    const newBefore = before.replace(/@[\w-]*$/, `@${user.displayName} `);
    setContent(newBefore + after);
    setMentionSuggestions([]);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = newBefore.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function insertEmoji(item: { shortcode: string; emoji: string }) {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    // Replace the partial :shortcode with the emoji character
    const newBefore = before.replace(/:[\w]*$/, item.emoji);
    setContent(newBefore + after);
    setEmojiSuggestions([]);
    setEmojiQuery('');
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = newBefore.length;
      textareaRef.current?.setSelectionRange(pos, pos);
      autoResize();
    }, 0);
  }

  function insertSlashCommand(cmd: { name: string; description: string }) {
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

    if (skillSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSkillIndex(i => Math.min(i + 1, skillSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSkillIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const skill = skillSuggestions[skillIndex];
        setContent(skill.name + ' ');
        setSkillSuggestions([]);
        setTimeout(() => {
          textareaRef.current?.focus();
          const pos = skill.name.length + 1;
          textareaRef.current?.setSelectionRange(pos, pos);
        }, 0);
        return;
      }
      if (e.key === 'Escape') {
        setSkillSuggestions([]);
        return;
      }
    }

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

    if (emojiSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEmojiIndex(i => Math.min(i + 1, emojiSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEmojiIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertEmoji(emojiSuggestions[emojiIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setEmojiSuggestions([]);
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
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Upload failed';
        setUploadError(msg);
        setTimeout(() => setUploadError(''), 5000);
        return;
      }
      const { url, fileName, mimeType, size } = data;
      setPendingFile({ url, fileName, mimeType, size });
    } catch {
      setUploadError('Upload failed. Please try again.');
      setTimeout(() => setUploadError(''), 5000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function uploadFile(file: File) {
    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Upload failed';
        setUploadError(msg);
        setTimeout(() => setUploadError(''), 5000);
        return;
      }
      const { url, fileName, mimeType, size } = data;
      setPendingFile({ url, fileName, mimeType, size });
    } catch {
      setUploadError('Upload failed. Please try again.');
      setTimeout(() => setUploadError(''), 5000);
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
    // Handle image files
    const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      uploadFile(file);
      return;
    }

    // Handle rich text (HTML) paste
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      const markdown = normalizeMarkdown(htmlToMarkdown(html));
      const el = textareaRef.current;
      const pos = el?.selectionStart ?? content.length;
      const selEnd = el?.selectionEnd ?? pos;
      const before = content.slice(0, pos);
      const after = content.slice(selEnd);
      const newContent = before + markdown + after;
      setContent(newContent);
      setTimeout(() => {
        el?.focus();
        const newPos = pos + markdown.length;
        el?.setSelectionRange(newPos, newPos);
        autoResize();
      }, 0);
    }
  }

  function applyCodeBlock() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const marker = '```';
    let newContent: string;
    let newCursorStart: number;
    let newCursorEnd: number;
    if (selected) {
      newContent = content.slice(0, start) + marker + '\n' + selected + '\n' + marker + content.slice(end);
      newCursorStart = start + marker.length + 1;
      newCursorEnd = start + marker.length + 1 + selected.length;
    } else {
      newContent = content.slice(0, start) + marker + '\n\n' + marker + content.slice(start);
      newCursorStart = start + marker.length + 1;
      newCursorEnd = start + marker.length + 1;
    }
    setContent(newContent);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newCursorStart, newCursorEnd);
      autoResize();
    }, 0);
  }

  function applyLink() {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const linkText = selected || 'https://';
    const newContent = content.slice(0, start) + linkText + content.slice(end);
    setContent(newContent);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start, start + linkText.length);
      autoResize();
    }, 0);
  }

  const toolbarButtons = [
    { icon: Bold, label: 'Bold', action: () => applyFormat('*') },
    { icon: Italic, label: 'Italic', action: () => applyFormat('_') },
    { icon: Strikethrough, label: 'Strikethrough', action: () => applyFormat('~') },
    { icon: Code, label: 'Code', action: () => applyFormat('`') },
    { icon: CodeSquare, label: 'Code block', action: applyCodeBlock },
    { icon: Link, label: 'Link', action: applyLink },
    { icon: List, label: 'Bulleted list', action: () => applyFormat('', '• ') },
    { icon: ListOrdered, label: 'Numbered list', action: () => applyFormat('', '1. ') },
    { icon: Quote, label: 'Quote', action: () => applyFormat('', '> ') },
  ];

  const hasContent = !!(content.trim() || pendingFile);

  return (
    <div className="relative px-4 pb-4">
      {/* Pending file preview */}
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 bg-[#222529] border border-white/10 rounded-lg px-3 py-2">
          <span className="text-slate-300 text-xs truncate flex-1">{pendingFile.fileName}</span>
          <span className="text-slate-500 text-xs shrink-0">
            {pendingFile.size < 1024 * 1024
              ? `${(pendingFile.size / 1024).toFixed(1)} KB`
              : `${(pendingFile.size / (1024 * 1024)).toFixed(1)} MB`}
          </span>
          <button
            onClick={() => setPendingFile(null)}
            className="text-slate-500 hover:text-white text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="mb-2 flex items-start gap-2 bg-[#222529] border border-red-500/30 rounded-lg px-3 py-2">
          <span className="text-red-400 text-xs flex-1">{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
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
      {/* Agent skill suggestions */}
      {skillSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          <div className="px-3 py-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider border-b border-white/5">Agent Skills</div>
          {skillSuggestions.map((skill, i) => (
            <button
              key={skill.skillId}
              onClick={() => {
                setContent(skill.name + ' ');
                setSkillSuggestions([]);
                setTimeout(() => {
                  textareaRef.current?.focus();
                  const pos = skill.name.length + 1;
                  textareaRef.current?.setSelectionRange(pos, pos);
                }, 0);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                i === skillIndex ? 'bg-[#4a154b]/50 text-white' : 'text-slate-300 hover:bg-white/5'
              )}
            >
              <span className="font-mono font-semibold text-[#36c5f0]">{skill.skillId}</span>
              <span className="text-slate-400 text-xs">{skill.description}</span>
            </button>
          ))}
        </div>
      )}

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

      {/* Emoji suggestions */}
      {emojiSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          <p className="px-3 py-1 text-[10px] text-slate-500 font-semibold uppercase tracking-wide border-b border-white/5">Emoji matching :{emojiQuery}</p>
          {emojiSuggestions.map((item, i) => (
            <button
              key={item.shortcode}
              onClick={() => insertEmoji(item)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-1.5 text-sm text-left transition-colors',
                i === emojiIndex ? 'bg-[#4a154b]/50 text-white' : 'text-slate-300 hover:bg-white/5'
              )}
            >
              <span className="text-lg w-7 text-center shrink-0">{item.emoji}</span>
              <span className="text-slate-400 font-mono text-xs">:{item.shortcode}:</span>
            </button>
          ))}
        </div>
      )}

      {/* Mention suggestions */}
      {mentionSuggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          {mentionSuggestions.map((user, i) => {
            const initials = (user.displayName || '?')
              .split(' ')
              .map((w: string) => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            return (
              <button
                key={user.id}
                onClick={() => insertMention(user)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  i === mentionIndex ? 'bg-[#4a154b]/50 text-white' : 'text-slate-300 hover:bg-white/5'
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="w-7 h-7">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.displayName} />}
                    <AvatarFallback className="text-[10px] bg-[#4a154b] text-white">{initials}</AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#222529]',
                    user.isOnline ? 'bg-[#2eb67d]' : 'bg-slate-600'
                  )} />
                </div>
                <div className="min-w-0">
                  <span className="font-medium block truncate">@{user.displayName}</span>
                  {user.statusMessage && (
                    <span className="text-xs text-slate-500 truncate block">{user.statusMessage}</span>
                  )}
                </div>
              </button>
            );
          })}
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
            aria-label="Attach file"
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
            aria-label={placeholder}
            className="flex-1 bg-transparent text-[#d1d2d3] placeholder:text-[#ababad] text-[15px] resize-none focus:outline-none leading-[1.46667] py-1 max-h-[200px] overflow-y-auto"
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

          {/* GIF picker button */}
          <GifPicker
            onSelect={handleGifSelect}
            open={gifPickerOpen}
            onOpenChange={setGifPickerOpen}
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
              <div className="absolute bottom-full right-0 mb-2 w-52 bg-[#222529] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                <p className="px-3 py-1.5 text-[11px] text-slate-500 font-semibold uppercase">Schedule send</p>
                {(() => {
                  const now = new Date();
                  const tomorrow9am = new Date(now);
                  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
                  tomorrow9am.setHours(9, 0, 0, 0);
                  return [
                    { label: 'In 30 minutes', scheduledFor: new Date(now.getTime() + 30 * 60 * 1000) },
                    { label: 'In 1 hour', scheduledFor: new Date(now.getTime() + 60 * 60 * 1000) },
                    { label: 'In 2 hours', scheduledFor: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
                    { label: 'Tomorrow 9am', scheduledFor: tomorrow9am },
                  ];
                })().map(opt => (
                  <button
                    key={opt.label}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                    onClick={async () => {
                      const msg = content.trim();
                      if (!msg) { setScheduleOpen(false); return; }
                      if (!channelId && !conversationId) { setScheduleOpen(false); return; }
                      setScheduleOpen(false);
                      try {
                        const res = await fetch('/api/scheduled-messages', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            content: replaceShortcodes(msg),
                            scheduledFor: opt.scheduledFor.toISOString(),
                            channelId: channelId ?? undefined,
                            conversationId: conversationId ?? undefined,
                          }),
                        });
                        if (res.ok) {
                          setContent('');
                          if (textareaRef.current) textareaRef.current.style.height = 'auto';
                          const timeLabel = opt.scheduledFor.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                          setEphemeralMessage(`Message scheduled for ${timeLabel}`);
                          setTimeout(() => setEphemeralMessage(null), 6000);
                        } else {
                          setEphemeralMessage('Failed to schedule message.');
                          setTimeout(() => setEphemeralMessage(null), 4000);
                        }
                      } catch {
                        setEphemeralMessage('Failed to schedule message.');
                        setTimeout(() => setEphemeralMessage(null), 4000);
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview toggle button — only shown when formatting chars present */}
          {hasFormatting && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setPreviewVisible(v => !v); }}
              title={previewVisible ? 'Hide preview' : 'Show formatting preview'}
              aria-label={previewVisible ? 'Hide formatting preview' : 'Show formatting preview'}
              aria-pressed={previewVisible}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {previewVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Send button — always visible */}
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!hasContent || isSending || disabled}
            aria-label="Send message"
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

      {/* Formatting preview strip */}
      {hasFormatting && previewVisible && (
        <div
          className="mt-1 px-3 py-1.5 bg-[#1a1d21] border border-white/10 rounded-lg text-sm text-slate-300 leading-relaxed"
          aria-label="Formatting preview"
        >
          <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(content) }} />
        </div>
      )}

      {/* Item 10: Shift+Enter hint */}
      {showShiftEnterHint && (
        <p className="mt-1 px-1 text-[11px] text-slate-600">
          Tip: <kbd className="bg-white/10 px-1 rounded text-slate-500">Shift+Enter</kbd> for new line
        </p>
      )}
    </div>
  );
}
