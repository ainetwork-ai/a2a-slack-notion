'use client';

import { useState, useMemo, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SmilePlus } from 'lucide-react';
import { EMOJI_CATEGORIES } from '@/lib/emoji-data';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'slack_recent_emojis';
const MAX_RECENT = 16;

function getRecentEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function addRecentEmoji(emoji: string) {
  const recents = getRecentEmojis().filter(e => e !== emoji);
  recents.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENT)));
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerIcon?: React.ReactNode;
  triggerTitle?: string;
  triggerClassName?: string;
}

export default function ReactionPicker({ onSelect, open, onOpenChange, triggerIcon, triggerTitle, triggerClassName }: ReactionPickerProps) {
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [search, setSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecentEmojis(getRecentEmojis());
    }
  }, [open]);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(q));
  }, [search]);

  function handleSelect(emoji: string) {
    addRecentEmoji(emoji);
    onSelect(emoji);
    onOpenChange(false);
  }

  const displayEmojis = filteredEmojis ?? (
    activeCategory === 'recent'
      ? recentEmojis
      : EMOJI_CATEGORIES.find(c => c.id === activeCategory)?.emojis ?? []
  );

  const tabs = [
    ...(recentEmojis.length > 0 ? [{ id: 'recent', label: '🕐' }] : []),
    ...EMOJI_CATEGORIES.map(c => ({ id: c.id, label: c.emojis[0] })),
  ];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={triggerClassName ?? "inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"}
        title={triggerTitle ?? "Add reaction"}
      >
        {triggerIcon ?? <SmilePlus className="w-3.5 h-3.5" />}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-[#222529] border-white/10"
        align="end"
        side="top"
      >
        {/* Search */}
        <div className="p-2 border-b border-white/10">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emojis..."
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-white/20"
          />
        </div>

        {/* Category tabs */}
        {!search.trim() && (
          <div className="flex gap-0.5 px-2 py-1 border-b border-white/10 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={cn(
                  'w-7 h-7 flex items-center justify-center rounded text-base shrink-0 transition-colors',
                  activeCategory === tab.id ? 'bg-white/15' : 'hover:bg-white/10'
                )}
                title={tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Category label */}
        {!search.trim() && (
          <div className="px-3 pt-1.5 pb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {activeCategory === 'recent'
                ? 'Recently Used'
                : EMOJI_CATEGORIES.find(c => c.id === activeCategory)?.label ?? ''}
            </span>
          </div>
        )}

        {/* Emoji grid */}
        <div className="grid grid-cols-8 gap-0.5 p-2 max-h-48 overflow-y-auto">
          {displayEmojis.length === 0 ? (
            <div className="col-span-8 text-center text-slate-500 text-xs py-4">
              {search.trim() ? 'No emojis found' : 'No recent emojis'}
            </div>
          ) : (
            displayEmojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => handleSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white/10 rounded transition-colors"
                title={emoji}
              >
                {emoji}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
