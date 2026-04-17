'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { usePageHeadings } from './use-page-headings';

interface PageOutlineProps {
  pageId: string;
  onJumpTo?: (blockId: string) => void;
}

const INDENT: Record<1 | 2 | 3, string> = {
  1: 'pl-0',
  2: 'pl-3',   // 12px
  3: 'pl-6',   // 24px
};

const FONT_SIZE: Record<1 | 2 | 3, string> = {
  1: 'text-[13px]',
  2: 'text-[12px]',
  3: 'text-[12px]',
};

/**
 * PageOutline — vertical heading TOC for a Notion page.
 *
 * Active-section tracking: an IntersectionObserver watches all heading elements
 * inside the editor scroll container (`[style*="canvas-body-${pageId}"]` via
 * view-transition-name). It highlights whichever heading is nearest the top of
 * the viewport.
 *
 * Scroll-to-block: uses `document.getElementById(blockId)` which assumes Tiptap
 * renders block nodes with `id={blockId}`. If that assumption breaks, clicking
 * will still call `onJumpTo` — the caller can wire its own scrollIntoView.
 * TODO: Confirm Tiptap block id attribute once editor integration is validated.
 */
export function PageOutline({ pageId, onJumpTo }: PageOutlineProps) {
  const { headings, isLoading } = usePageHeadings(pageId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Set up IntersectionObserver to track active heading
  useEffect(() => {
    if (headings.length === 0) return;

    // Find editor scroll container via view-transition-name style
    const editorBody = document.querySelector<HTMLElement>(
      `[style*="canvas-body-${pageId}"]`
    );
    const root = editorBody ?? null;

    observerRef.current?.disconnect();

    const entries = new Map<string, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (newEntries) => {
        for (const entry of newEntries) {
          entries.set(entry.target.id, entry);
        }
        // Pick the topmost visible heading (lowest boundingClientRect.top >= 0)
        let best: string | null = null;
        let bestTop = Infinity;
        for (const [id, entry] of entries) {
          if (entry.isIntersecting && entry.boundingClientRect.top < bestTop) {
            bestTop = entry.boundingClientRect.top;
            best = id;
          }
        }
        // Fallback: pick topmost element above viewport (last heading scrolled past)
        if (!best) {
          let closestAbove = -Infinity;
          for (const [id, entry] of entries) {
            const top = entry.boundingClientRect.top;
            if (top < 0 && top > closestAbove) {
              closestAbove = top;
              best = id;
            }
          }
        }
        if (best !== null) setActiveId(best);
      },
      {
        root,
        // Large bottom margin so headings near the top trigger early
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      }
    );

    for (const heading of headings) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [headings, pageId]);

  const handleClick = useCallback(
    (blockId: string) => {
      // Try native scroll first
      const el = document.getElementById(blockId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveId(blockId);
      }
      onJumpTo?.(blockId);
    },
    [onJumpTo]
  );

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-[12px] text-slate-500 animate-pulse">
        Loading outline…
      </div>
    );
  }

  if (headings.length === 0) {
    return (
      <div className="px-3 py-4 text-[12px] text-slate-500 leading-relaxed">
        No headings yet — add{' '}
        <code className="font-mono text-slate-400">#</code>,{' '}
        <code className="font-mono text-slate-400">##</code>, or{' '}
        <code className="font-mono text-slate-400">###</code> to structure the
        page.
      </div>
    );
  }

  return (
    <nav aria-label="Page outline" className="flex flex-col gap-0.5 py-1 px-2">
      {headings.map((h) => (
        <button
          key={h.id}
          onClick={() => handleClick(h.id)}
          title={h.text || 'Untitled heading'}
          className={cn(
            'flex items-start text-left w-full rounded px-1.5 py-0.5 transition-colors duration-100',
            INDENT[h.level],
            FONT_SIZE[h.level],
            'text-slate-300 hover:text-white hover:bg-white/5',
            activeId === h.id && 'text-white bg-white/10'
          )}
        >
          <span className="truncate">{h.text || 'Untitled heading'}</span>
        </button>
      ))}
    </nav>
  );
}
