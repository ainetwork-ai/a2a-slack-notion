'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  name: string;
  avatar?: string;
  icon?: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="min-w-[200px] rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-2">
          <p className="text-xs text-[var(--text-tertiary)] px-2 py-1">No results</p>
        </div>
      );
    }

    return (
      <div className="min-w-[220px] max-h-[240px] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-1">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={cn(
              'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-[var(--radius-sm)] text-left transition-colors duration-[var(--duration-micro)]',
              index === selectedIndex
                ? 'bg-[var(--bg-active)]'
                : 'hover:bg-[var(--bg-hover)]',
            )}
          >
            {/* Avatar or icon */}
            {item.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.avatar}
                alt={item.name}
                className="w-6 h-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
                {item.icon ? (
                  <span className="text-sm leading-none">{item.icon}</span>
                ) : (
                  <span className="text-xs font-semibold text-white leading-none">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <span className="text-sm text-[var(--text-primary)] truncate">{item.name}</span>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';
