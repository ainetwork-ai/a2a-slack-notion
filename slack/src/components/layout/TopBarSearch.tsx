'use client';

/**
 * Inline scoped search for the TopBar.
 *
 * Unified across channels, messages, Notion pages/blocks, and canvases — backed
 * by /api/search. Gracefully degrades to empty results if the API errors (which
 * itself degrades to Postgres when Meilisearch is unavailable).
 *
 * Features:
 *   - 150ms debounced query
 *   - Dropdown grouped by type with icons
 *   - Inline scope toggles (All / Channels / Docs)
 *   - Cmd/Ctrl+K focuses the input
 *   - Keyboard nav (↑/↓, Enter, Esc)
 */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Hash, Loader2, MessageSquare, Search as SearchIcon, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Scopes map 1:1 to the server's `scope` query param.
type Scope = 'all' | 'channels' | 'docs';

type ResultItem = {
  id: string;
  type: 'channel' | 'message' | 'user' | 'canvas' | 'page' | 'block';
  content?: string;
  title?: string;
  channelId?: string | null;
  channelName?: string | null;
  senderName?: string | null;
  pageId?: string;
  icon?: string | null;
  blockType?: string;
};

interface Props {
  workspaceId: string | null;
  placeholder?: string;
}

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'channels', label: 'Channels' },
  { key: 'docs', label: 'Docs' },
];

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  return text.split(re).map((part, i) =>
    re.test(part) ? (
      <mark key={i} className="bg-yellow-400/40 text-yellow-200 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function TopBarSearch({ workspaceId, placeholder }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Cmd/Ctrl+K focuses the search input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced fetch (150 ms)
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          scope,
          limit: '20',
        });
        if (workspaceId) params.set('workspace', workspaceId);
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        // Graceful degrade — show empty
        setResults([]);
      } finally {
        setIsSearching(false);
        setActiveIndex(0);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [q, scope, workspaceId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!listRef.current) return;
      const target = e.target as Node | null;
      const inContainer =
        (target && listRef.current.contains(target)) ||
        (target && inputRef.current?.contains(target));
      if (!inContainer) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const grouped = useMemo(() => {
    const channels = results.filter((r) => r.type === 'channel');
    const pages = results.filter((r) => r.type === 'page');
    const blocks = results.filter((r) => r.type === 'block');
    const canvases = results.filter((r) => r.type === 'canvas');
    const messages = results.filter((r) => r.type === 'message');
    const users = results.filter((r) => r.type === 'user');
    return { channels, pages, blocks, canvases, messages, users };
  }, [results]);

  // Flat order used for ↑/↓ keyboard nav — matches rendered order below.
  const flat = useMemo(
    () => [
      ...grouped.channels,
      ...grouped.pages,
      ...grouped.blocks,
      ...grouped.canvases,
      ...grouped.messages,
      ...grouped.users,
    ],
    [grouped],
  );

  function navigateTo(item: ResultItem) {
    switch (item.type) {
      case 'channel':
        router.push(`/workspace/channel/${item.id}`);
        break;
      case 'message':
        if (item.channelId) {
          router.push(`/workspace/channel/${item.channelId}#msg-${item.id}`);
        }
        break;
      case 'canvas':
        if (item.channelId) router.push(`/workspace/channel/${item.channelId}?canvas=1`);
        break;
      case 'page':
        router.push(`/workspace/pages/${item.id}`);
        break;
      case 'block':
        if (item.pageId) router.push(`/workspace/pages/${item.pageId}#block-${item.id}`);
        break;
      case 'user':
        // No user route — best-effort: open a DM search modal later. For now no-op.
        break;
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flat[activeIndex];
      if (target) navigateTo(target);
    }
  }

  const showDropdown = open && q.trim().length > 0;
  let runningIndex = 0;

  function renderItem(item: ResultItem) {
    const idx = runningIndex++;
    const active = idx === activeIndex;
    const icon = iconFor(item);
    const label = labelFor(item);
    const subtitle = subtitleFor(item);
    return (
      <button
        key={`${item.type}-${item.id}`}
        onMouseEnter={() => setActiveIndex(idx)}
        onMouseDown={(e) => {
          e.preventDefault();
          navigateTo(item);
        }}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
          active ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
        )}
      >
        <span className="shrink-0 w-4 h-4 text-slate-400 flex items-center justify-center">
          {icon}
        </span>
        <span className="flex-1 min-w-0 truncate">{highlight(label, q)}</span>
        {subtitle && (
          <span className="shrink-0 text-[11px] text-slate-500 truncate max-w-[45%]">
            {subtitle}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="relative w-full max-w-[720px]">
      <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-black/15 focus-within:bg-black/25 border border-white/10 focus-within:border-white/25 transition-colors">
        <SearchIcon className="w-4 h-4 text-white/70 shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (q.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'Search'}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
          aria-label="Search"
        />
        {q ? (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setQ('');
              inputRef.current?.focus();
            }}
            className="text-white/60 hover:text-white"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden md:inline text-[11px] text-white/50 border border-white/15 rounded px-1 py-0.5 font-mono">
            ⌘K
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1d21] border border-white/10 rounded-md shadow-2xl overflow-hidden"
        >
          {/* Scope toggles */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setScope(s.key);
                }}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors',
                  scope === s.key
                    ? 'bg-[#4a154b] text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white',
                )}
              >
                {s.label}
              </button>
            ))}
            {isSearching && (
              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin ml-auto" />
            )}
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {flat.length === 0 && !isSearching && (
              <div className="py-6 text-center text-xs text-slate-500">
                No results for &quot;{q}&quot;
              </div>
            )}

            {grouped.channels.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  Channels
                </div>
                {grouped.channels.map(renderItem)}
              </div>
            )}

            {grouped.pages.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  Pages
                </div>
                {grouped.pages.map(renderItem)}
              </div>
            )}

            {grouped.blocks.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  In pages
                </div>
                {grouped.blocks.map(renderItem)}
              </div>
            )}

            {grouped.canvases.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  Canvases
                </div>
                {grouped.canvases.map(renderItem)}
              </div>
            )}

            {grouped.messages.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  Messages
                </div>
                {grouped.messages.map(renderItem)}
              </div>
            )}

            {grouped.users.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  People
                </div>
                {grouped.users.map(renderItem)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function iconFor(item: ResultItem): React.ReactNode {
  switch (item.type) {
    case 'channel':
      return <Hash className="w-4 h-4" />;
    case 'message':
      return <MessageSquare className="w-4 h-4" />;
    case 'page':
      return item.icon ? (
        <span className="text-base leading-none">{item.icon}</span>
      ) : (
        <FileText className="w-4 h-4" />
      );
    case 'block':
      return <FileText className="w-4 h-4 opacity-60" />;
    case 'canvas':
      return <span className="text-base leading-none">📝</span>;
    case 'user':
      return <User className="w-4 h-4" />;
    default:
      return <SearchIcon className="w-4 h-4" />;
  }
}

function labelFor(item: ResultItem): string {
  if (item.type === 'page') return item.title ?? item.content ?? 'Untitled';
  if (item.type === 'block') return item.content ?? '(empty)';
  if (item.type === 'message') return item.content ?? '';
  return item.content ?? '';
}

function subtitleFor(item: ResultItem): string | null {
  if (item.type === 'message' && item.channelName) return `#${item.channelName}`;
  if (item.type === 'message' && item.senderName) return item.senderName;
  return null;
}
