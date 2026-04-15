import { useState, useCallback, useRef } from 'react';

export interface SearchResult {
  id: string;
  type: 'message' | 'channel' | 'user';
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
  const [query, setQuery] = useState('');
  const [textQuery, setTextQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!q.trim()) {
      setResults([]);
      setTextQuery('');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data.results ?? []);
        setTextQuery(data.textQuery ?? q.trim());
      } catch {
        setResults([]);
        setTextQuery('');
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setTextQuery('');
    setResults([]);
    setIsSearching(false);
  }

  return { results, isSearching, query, textQuery, search, clearSearch };
}
