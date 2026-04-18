'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/notion/api';

interface SearchResult {
  id: string;
  title?: string;
  icon?: string | null;
  createdBy?: string;
  updatedAt?: string;
}

interface SearchResponse {
  object: 'list';
  results: SearchResult[];
  total: number;
  source: string;
}

interface SearchModalProps {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="bg-[var(--accent-blue-light,rgba(35,131,226,0.14))] text-[var(--accent-blue)] rounded-sm not-italic"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(dateStr),
    );
  } catch {
    return '';
  }
}

export function SearchModal({ workspaceId, open, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiFetch<SearchResponse>('/api/v1/search', {
          method: 'POST',
          body: JSON.stringify({ query: q, workspaceId, limit: 20 }),
        });
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      router.push(`/notion/workspace/${workspaceId}/${result.id}`);
      onClose();
    },
    [router, workspaceId, onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[selectedIndex];
        if (r) navigateToResult(r);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, results, selectedIndex, navigateToResult, onClose]);

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search pages"
      className="fixed inset-0 z-[var(--z-modal,10000)] flex items-start justify-center md:pt-[12vh] bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal panel — full-screen on mobile, floating on md+ */}
      <div
        className="w-full h-full md:h-auto md:max-w-[600px] md:mx-4 md:rounded-[8px] bg-[var(--bg-default)] shadow-[var(--shadow-modal)] animate-modal-in overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(70vh, 100%)' }}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 h-[52px] border-b border-[var(--divider)] shrink-0">
          <Search size={18} className="text-[var(--text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-[15px] outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
            >
              <X size={14} className="text-[var(--text-tertiary)]" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-1">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-[var(--text-tertiary)]">Searching...</span>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <FileText size={28} className="text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">No pages found for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {!loading && !query && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Search size={28} className="text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">Type to search pages...</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul>
              {results.map((result, i) => {
                const title = result.title ?? 'Untitled';
                return (
                  <li key={result.id}>
                    <button
                      onClick={() => navigateToResult(result)}
                      className={cn(
                        'notion-hover flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-sm)] text-left transition-colors duration-[var(--duration-micro)]',
                        i === selectedIndex ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
                      )}
                    >
                      {/* Icon */}
                      <span className="text-[18px] shrink-0 leading-none">
                        {result.icon ?? '📄'}
                      </span>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">
                          {highlightMatch(title, query)}
                        </p>
                        {result.updatedAt && (
                          <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5">
                            <Clock size={10} />
                            {formatDate(result.updatedAt)}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--divider)] shrink-0">
          <span className="text-xs text-[var(--text-tertiary)]">
            <kbd className="font-mono bg-[var(--bg-hover)] rounded px-1 py-0.5 text-[10px]">↑↓</kbd> navigate
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            <kbd className="font-mono bg-[var(--bg-hover)] rounded px-1 py-0.5 text-[10px]">↵</kbd> open
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            <kbd className="font-mono bg-[var(--bg-hover)] rounded px-1 py-0.5 text-[10px]">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
