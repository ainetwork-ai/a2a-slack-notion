'use client';

import { useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ImagePlay } from 'lucide-react';
import { cn } from '@/lib/utils';

const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';

interface TenorResult {
  id: string;
  title: string;
  media_formats: {
    tinygif?: { url: string; dims: number[] };
    gif?: { url: string; dims: number[] };
  };
}

interface GifPickerProps {
  onSelect: (url: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GifPicker({ onSelect, open, onOpenChange }: GifPickerProps) {
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState<TenorResult[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchGifs = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const endpoint = query.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=20&media_filter=tinygif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=20&media_filter=tinygif`;
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const data = await res.json();
      setGifs(data.results ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (open) {
      fetchGifs('');
    }
  }, [open, fetchGifs]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) fetchGifs(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, open, fetchGifs]);

  function handleSelect(gif: TenorResult) {
    const url = gif.media_formats.tinygif?.url ?? gif.media_formats.gif?.url;
    if (!url) return;
    onSelect(url);
    onOpenChange(false);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Send a GIF"
      >
        <ImagePlay className="w-4 h-4" />
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 bg-[#222529] border-white/10"
        align="end"
        side="top"
      >
        {/* Search */}
        <div className="p-2 border-b border-white/10">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-white/20"
            autoFocus
          />
        </div>

        {/* Label */}
        <div className="px-3 pt-1.5 pb-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {search.trim() ? `Results for "${search}"` : 'Trending'}
          </span>
        </div>

        {/* GIF grid */}
        <div className="p-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-slate-500 text-xs">Loading...</span>
            </div>
          ) : gifs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-slate-500 text-xs">No GIFs found</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {gifs.map(gif => {
                const url = gif.media_formats.tinygif?.url ?? gif.media_formats.gif?.url;
                if (!url) return null;
                return (
                  <button
                    key={gif.id}
                    onClick={() => handleSelect(gif)}
                    className={cn(
                      'relative overflow-hidden rounded-md bg-white/5 hover:opacity-80 transition-opacity',
                      'aspect-video'
                    )}
                    title={gif.title}
                  >
                    <img
                      src={url}
                      alt={gif.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tenor attribution */}
        <div className="px-3 pb-2 pt-1 border-t border-white/5">
          <span className="text-[10px] text-slate-600">Powered by Tenor</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
