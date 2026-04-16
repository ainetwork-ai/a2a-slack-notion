import { useState, useCallback, useRef } from 'react';

export interface SearchResult {
  id: string;
  type: 'message' | 'channel' | 'user' | 'canvas';
  content: string;
  channelId?: string;
  channelName?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: string;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [textQuery, setTextQuery] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const limitRef = useRef(50);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryRef = useRef('');

  const search = useCallback((q: string) => {
    setQuery(q);
    currentQueryRef.current = q;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!q.trim()) {
      setResults([]);
      setTextQuery('');
      setIsSearching(false);
      setHasMore(false);
      setCurrentOffset(0);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&offset=0&limit=${limitRef.current}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data.results ?? []);
        setTextQuery(data.textQuery ?? q.trim());
        setHasMore(data.hasMore ?? false);
        setCurrentOffset(0);
      } catch {
        setResults([]);
        setTextQuery('');
        setHasMore(false);
        setCurrentOffset(0);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const loadMore = useCallback(async () => {
    const q = currentQueryRef.current;
    if (!q.trim() || isLoadingMore) return;

    setIsLoadingMore(true);
    const nextOffset = currentOffset + limitRef.current;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&offset=${nextOffset}&limit=${limitRef.current}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(prev => [...prev, ...(data.results ?? [])]);
      setHasMore(data.hasMore ?? false);
      setCurrentOffset(nextOffset);
    } catch {
      // keep existing results on failure
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentOffset, isLoadingMore]);

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setTextQuery('');
    setResults([]);
    setIsSearching(false);
    setHasMore(false);
    setCurrentOffset(0);
    currentQueryRef.current = '';
  }

  return { results, isSearching, isLoadingMore, query, textQuery, search, clearSearch, hasMore, loadMore };
}
