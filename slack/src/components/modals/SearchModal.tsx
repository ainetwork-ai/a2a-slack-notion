'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, MessageSquare, User, Loader2, Search, X } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { useSearch } from '@/lib/hooks/use-search';

export default function SearchModal() {
  const router = useRouter();
  const { searchOpen, setSearchOpen } = useAppStore();
  const { results, isSearching, query, search, clearSearch } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

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

          {/* Results */}
          <div className="max-h-80 overflow-y-auto scrollbar-slack">
            {isSearching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            )}

            {!isSearching && query && results.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">
                No results found for &quot;{query}&quot;
              </div>
            )}

            {!query && !isSearching && (
              <div className="py-8 text-center text-slate-500 text-sm">
                Type to search messages, channels, and people
              </div>
            )}

            {channelResults.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Channels
                </div>
                {channelResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors text-left"
                  >
                    <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{result.content}</span>
                  </button>
                ))}
              </div>
            )}

            {messageResults.length > 0 && (
              <div>
                {channelResults.length > 0 && <div className="h-px bg-white/10 mx-4" />}
                <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Messages
                </div>
                {messageResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex flex-col gap-0.5 px-4 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium text-white truncate">{result.senderName}</span>
                      {result.channelName && (
                        <span className="text-slate-500 text-xs ml-auto shrink-0">#{result.channelName}</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs pl-6 line-clamp-1">{result.content}</p>
                  </button>
                ))}
              </div>
            )}

            {userResults.length > 0 && (
              <div>
                {(channelResults.length > 0 || messageResults.length > 0) && (
                  <div className="h-px bg-white/10 mx-4" />
                )}
                <div className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  People
                </div>
                {userResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors text-left"
                  >
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{result.content}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
