'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, MessageSquare, User, Loader2, Search, X, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { useSearch } from '@/lib/hooks/use-search';

type FilterType = 'all' | 'messages' | 'channels' | 'people';

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-400/40 text-yellow-200 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const FILTER_LABELS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'messages', label: 'Messages' },
  { key: 'channels', label: 'Channels' },
  { key: 'people', label: 'People' },
];

export default function SearchModal() {
  const router = useRouter();
  const { searchOpen, setSearchOpen } = useAppStore();
  const { results, isSearching, isLoadingMore, query, textQuery, search, clearSearch, hasMore, loadMore } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape' && searchOpen) {
        handleClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen, searchOpen]);

  // Auto-focus input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  // Reset filter when modal closes
  useEffect(() => {
    if (!searchOpen) setActiveFilter('all');
  }, [searchOpen]);

  function handleClose() {
    setSearchOpen(false);
    clearSearch();
  }

  function handleSelect(result: { type: string; channelId?: string; id: string }) {
    if (result.type === 'channel') {
      router.push(`/workspace/channel/${result.id}`);
    } else if (result.type === 'message' && result.channelId) {
      router.push(`/workspace/channel/${result.channelId}#msg-${result.id}`);
    }
    handleClose();
  }

  if (!searchOpen) return null;

  const channelResults = results.filter(r => r.type === 'channel');
  const messageResults = results.filter(r => r.type === 'message');
  const userResults = results.filter(r => r.type === 'user');

  const visibleChannels = activeFilter === 'all' || activeFilter === 'channels' ? channelResults : [];
  const visibleMessages = activeFilter === 'all' || activeFilter === 'messages' ? messageResults : [];
  const visibleUsers = activeFilter === 'all' || activeFilter === 'people' ? userResults : [];

  const hasResults = visibleChannels.length > 0 || visibleMessages.length > 0 || visibleUsers.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 top-[15%] z-50 mx-auto w-full max-w-lg">
        <div className="bg-[#1a1d21] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search messages, channels, people..."
              className="flex-1 bg-transparent text-white placeholder:text-slate-500 text-sm focus:outline-none"
            />
            {query && (
              <button onClick={() => search('')} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-slate-500 border border-white/10 rounded">
              ESC
            </kbd>
          </div>

          {/* Filter chips */}
          {query && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/10">
              {FILTER_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    activeFilter === key
                      ? 'bg-[#4a154b] text-white'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {label}
                  {key !== 'all' && (
                    <span className="ml-1 opacity-60">
                      {key === 'messages' && `(${messageResults.length})`}
                      {key === 'channels' && `(${channelResults.length})`}
                      {key === 'people' && `(${userResults.length})`}
                    </span>
                  )}
                </button>
              ))}
              {query && !isSearching && (
                <span className="ml-auto text-[11px] text-slate-500">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Results */}
          <div className="max-h-80 overflow-y-auto scrollbar-slack">
            {isSearching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            )}

            {!isSearching && query && !hasResults && (
              <div className="py-8 text-center text-slate-400 text-sm">
                No results found for &quot;{query}&quot;
              </div>
            )}

            {!query && !isSearching && (
              <div className="py-6 text-center text-slate-500 text-sm space-y-1">
                <p>Type to search messages, channels, and people</p>
                <p className="text-xs text-slate-600">
                  Tip: use <span className="font-mono text-slate-500">from:</span>, <span className="font-mono text-slate-500">in:</span>, <span className="font-mono text-slate-500">has:link</span>, <span className="font-mono text-slate-500">has:pin</span>, <span className="font-mono text-slate-500">before:</span>, <span className="font-mono text-slate-500">after:</span>
                </p>
              </div>
            )}

            {visibleChannels.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Channels
                </div>
                {visibleChannels.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors text-left"
                  >
                    <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{highlightText(result.content, textQuery)}</span>
                  </button>
                ))}
              </div>
            )}

            {visibleMessages.length > 0 && (
              <div>
                {visibleChannels.length > 0 && <div className="h-px bg-white/10 mx-4" />}
                <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Messages
                </div>
                {visibleMessages.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex flex-col gap-0.5 px-4 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-white truncate">
                        {highlightText(result.senderName ?? '', textQuery)}
                      </span>
                      {result.channelName && (
                        <span className="text-slate-500 text-xs ml-auto shrink-0">#{result.channelName}</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs pl-6 line-clamp-1">
                      {highlightText(result.content, textQuery)}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {visibleUsers.length > 0 && (
              <div>
                {(visibleChannels.length > 0 || visibleMessages.length > 0) && (
                  <div className="h-px bg-white/10 mx-4" />
                )}
                <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  People
                </div>
                {visibleUsers.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors text-left"
                  >
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{highlightText(result.content, textQuery)}</span>
                  </button>
                ))}
              </div>
            )}

            {hasMore && (activeFilter === 'all' || activeFilter === 'messages') && (
              <div className="px-4 py-2 border-t border-white/10">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {isLoadingMore ? 'Loading...' : 'Load more results'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
