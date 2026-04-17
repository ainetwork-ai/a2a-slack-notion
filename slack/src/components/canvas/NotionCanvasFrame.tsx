'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { acquire, release, bindPlaceholder } from '@/lib/notion/notion-iframe-registry';

interface Props {
  pageId: string;
  mode: 'panel' | 'full';
  onLoadFail?: () => void;
  className?: string;
}

const LOAD_TIMEOUT_MS = 5000;

export default function NotionCanvasFrame({ pageId, mode, onLoadFail, className }: Props) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!placeholderRef.current) return;
    const iframe = acquire(pageId);
    const vtName = `notion-frame-${pageId}`;
    const unbind = bindPlaceholder(pageId, placeholderRef.current, vtName);

    const onLoad = () => setLoaded(true);
    const onError = () => { setFailed(true); onLoadFail?.(); };
    iframe.addEventListener('load', onLoad);
    iframe.addEventListener('error', onError);

    // Timeout guard — if no load event fires, surface failure.
    const timer = window.setTimeout(() => {
      if (!iframe.contentDocument || iframe.contentDocument.readyState === 'loading') {
        // still loading after timeout — leave; the real load/error will resolve.
      }
    }, LOAD_TIMEOUT_MS);

    // If the iframe already loaded before we attached (cached from prior mount),
    // synthesize a loaded state.
    if (iframe.contentDocument?.readyState === 'complete') {
      setLoaded(true);
    }

    return () => {
      window.clearTimeout(timer);
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
      unbind();
      release(pageId);
    };
  }, [pageId, onLoadFail]);

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1a1d21] text-slate-300 text-sm px-4 text-center">
          <p>Editor failed to load.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15"
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
