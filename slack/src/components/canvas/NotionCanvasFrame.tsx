'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { acquire, release, bindPlaceholder, destroy } from '@/lib/notion/notion-iframe-registry';

interface Props {
  pageId: string;
  mode: 'panel' | 'full';
  // Optional callbacks forwarded by parents (CanvasEditor / /pages/[id]).
  // Not consumed inside this component — the actual expand/collapse buttons
  // live in the parent chrome per spec, outside the placeholder div.
  onExpand?: () => void;
  onCollapse?: () => void;
  // Surfaced inside the failure UI as a "Switch to markdown" button. When
  // undefined (e.g., /pages/[id] full mode), only "Reload" is shown.
  onSwitchToMarkdown?: () => void;
  className?: string;
}

const LOAD_TIMEOUT_MS = 5000;

export default function NotionCanvasFrame({
  pageId,
  mode,
  onSwitchToMarkdown,
  className,
}: Props) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!placeholderRef.current) return;
    const iframe = acquire(pageId);
    const vtName = `notion-frame-${pageId}`;
    const unbind = bindPlaceholder(pageId, placeholderRef.current, vtName);

    let resolved = false;

    const markLoaded = () => {
      if (resolved) return;
      resolved = true;
      loadedRef.current = true;
      setLoaded(true);
    };
    const markFailed = () => {
      if (resolved) return;
      resolved = true;
      setFailed(true);
      // Destroy the registry entry so a subsequent retry (e.g. Reload)
      // starts from a clean slate.
      destroy(pageId);
    };

    iframe.addEventListener('load', markLoaded);
    iframe.addEventListener('error', markFailed);

    // 5-second timeout: if the iframe never fires `load`, treat it as a
    // hard failure and surface the failure UI with a markdown fallback.
    const timer = window.setTimeout(() => {
      if (loadedRef.current) return;
      markFailed();
    }, LOAD_TIMEOUT_MS);

    // If the iframe already loaded before we attached (cached from prior mount),
    // synthesize a loaded state.
    if (iframe.contentDocument?.readyState === 'complete') {
      markLoaded();
    }

    return () => {
      window.clearTimeout(timer);
      iframe.removeEventListener('load', markLoaded);
      iframe.removeEventListener('error', markFailed);
      unbind();
      // Only release on unmount — destroy is reserved for the failure
      // path so the iframe persists across panel ↔ full transitions.
      release(pageId);
    };
  }, [pageId]);

  return (
    <div
      ref={placeholderRef}
      data-notion-frame-mode={mode}
      className={`relative w-full h-full bg-white ${className ?? ''}`}
    >
      {!loaded && !failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1d21]/40">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1d21] text-slate-300 text-sm px-4 text-center">
          <p>Editor failed to load.</p>
          {onSwitchToMarkdown ? (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => onSwitchToMarkdown()}
                className="px-3 py-1.5 text-xs rounded bg-white/15 hover:bg-white/20 font-medium"
              >
                Switch to markdown
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Reload
              </button>
            </div>
          ) : (
            <button
              onClick={() => window.location.reload()}
              className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15"
            >
              Reload
            </button>
          )}
        </div>
      )}
    </div>
  );
}
