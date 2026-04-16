'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SlashCommandItem } from './slash-command-items';
import { getRecentlyUsed, MENU_MAX_HEIGHT } from './slash-command-items';

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  query: string;
}

export interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command, query }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = flatItems[index];
      if (item && !item.disabled) {
        command(item);
      }
    };

    // Build recently-used items (only when query is empty)
    const recentTitles = !query ? getRecentlyUsed() : [];
    const recentItems = recentTitles
      .map((title) => items.find((item) => item.title === title))
      .filter((item): item is SlashCommandItem => item !== undefined);

    // Group items (filtered list preserves order, we group by group field)
    const groups: Array<{ label: string; items: SlashCommandItem[] }> = [];

    if (!query && recentItems.length > 0) {
      groups.push({ label: 'RECENTLY USED', items: recentItems });
    }

    const groupOrder = ['BASIC BLOCKS', 'MEDIA', 'EMBEDS'] as const;
    for (const groupName of groupOrder) {
      const groupItems = items.filter((item) => item.group === groupName);
      if (groupItems.length > 0) {
        groups.push({ label: groupName, items: groupItems });
      }
    }

    // Build flat index list for keyboard navigation — deduplicate by title
    const flatItems: SlashCommandItem[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (!flatItems.some((f) => f.title === item.title)) {
          flatItems.push(item);
        }
      }
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % flatItems.length);
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
        <div className="slash-command-menu min-w-[300px] rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-0">
          <p className="text-sm text-[var(--text-tertiary)] text-center py-4 px-3">
            No results
          </p>
        </div>
      );
    }

    return (
      <div
        className="slash-command-menu min-w-[300px] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-0"
        style={{ maxHeight: MENU_MAX_HEIGHT }}
      >
        {groups.map((group) => (
          <div key={group.label}>
            {/* Group header */}
            <div
              className="px-3 pt-3 pb-1"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
              }}
            >
              {group.label}
            </div>

            {/* Items */}
            {group.items.map((item) => {
              const flatIndex = flatItems.findIndex((f) => f.title === item.title);
              const isSelected = flatIndex === selectedIndex;
              const Icon = item.icon;

              return (
                <button
                  key={`${group.label}-${item.title}`}
                  onClick={() => selectItem(flatIndex)}
                  disabled={item.disabled}
                  className={cn(
                    'flex items-center gap-[10px] w-full text-left transition-colors duration-[var(--duration-micro)]',
                    item.disabled
                      ? 'opacity-40 cursor-not-allowed pointer-events-none'
                      : isSelected
                        ? 'bg-[var(--bg-hover)]'
                        : 'hover:bg-[var(--bg-hover)]',
                  )}
                  style={{
                    height: 44,
                    padding: '0 12px',
                    borderRadius: 3,
                    margin: '0 4px',
                    width: 'calc(100% - 8px)',
                  }}
                >
                  {/* Icon box */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 6,
                      background: 'var(--bg-hover)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} style={{ color: 'var(--text-secondary)' }} />
                  </div>

                  {/* Text */}
                  <div className="flex flex-col flex-1 min-w-0">
                    <span style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {item.title}
                      {item.disabled && (
                        <span
                          style={{
                            fontSize: 10,
                            marginLeft: 6,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'var(--bg-active)',
                            color: 'var(--text-tertiary)',
                            verticalAlign: 'middle',
                          }}
                        >
                          soon
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.description}
                    </span>
                  </div>

                  {/* Shortcut */}
                  {item.shortcut && (
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-tertiary)',
                        flexShrink: 0,
                        marginLeft: 'auto',
                      }}
                    >
                      {item.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Bottom padding */}
        <div style={{ height: 4 }} />
      </div>
    );
  },
);

SlashCommandList.displayName = 'SlashCommandList';
