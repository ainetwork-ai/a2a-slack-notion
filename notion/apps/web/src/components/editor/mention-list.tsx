'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  name: string;
  avatar?: string;
  icon?: string;
  isAgent?: boolean;
  agentStatus?: string;
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

    const users = items.filter((item) => !item.isAgent);
    const agents = items.filter((item) => item.isAgent);
    const hasGroups = users.length > 0 && agents.length > 0;

    const renderItem = (item: MentionItem, index: number) => (
      <button
        key={item.id}
        onClick={() => selectItem(index)}
        className={cn(
          'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-[var(--radius-sm)] text-left transition-colors duration-[var(--duration-micro)]',
          index === selectedIndex
            ? 'bg-[var(--bg-active)]'
            : 'hover:bg-[var(--bg-hover)]',
          item.isAgent && 'bg-[var(--bg-hover)]/40',
        )}
      >
        {/* Avatar or icon */}
        {item.isAgent ? (
          <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--accent-blue)]/10 flex items-center justify-center shrink-0">
            <span className="text-sm leading-none">🤖</span>
          </div>
        ) : item.avatar ? (
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
        {item.isAgent && (
          <span className="ml-auto shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
            Agent
          </span>
        )}
      </button>
    );

    return (
      <div className="min-w-[220px] max-h-[240px] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-1">
        {hasGroups ? (
          <>
            {users.map((item) => renderItem(item, items.indexOf(item)))}
            <div className="flex items-center gap-1 px-2 py-1 mt-1">
              <div className="flex-1 h-px bg-[var(--divider)]" />
              <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Agents</span>
              <div className="flex-1 h-px bg-[var(--divider)]" />
            </div>
            {agents.map((item) => renderItem(item, items.indexOf(item)))}
          </>
        ) : (
          items.map((item, index) => renderItem(item, index))
        )}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';
