'use client';

import { useRouter } from 'next/navigation';
import { Minimize2 } from 'lucide-react';
import NotionCanvasFrame from '@/components/canvas/NotionCanvasFrame';
import { seamlessNavigate } from '@/lib/notion/transitions';

interface Props {
  pageId: string;
}

/**
 * Full-page client shell for `/pages/[id]`.
 *
 * The iframe lives in the persistent registry (see `notion-iframe-registry.ts`):
 * mounting `<NotionCanvasFrame mode="full">` here re-binds the *same* DOM node
 * that the panel-mode mount last attached to, so Y.js / WebSocket / scroll /
 * cursor state survive the panel ↔ full morph (refCount transitions 1 → 2 → 1
 * during the seamless navigation rather than 1 → 0 → 1).
 *
 * The Collapse chrome is rendered OUTSIDE the placeholder div on purpose: the
 * iframe is `position: fixed` overlaid on top of the placeholder at z-index 40,
 * so any UI we want visible above the editor must sit at z-index 50+.
 */
export default function PageFullClient({ pageId }: Props) {
  const router = useRouter();

  const handleCollapse = () => {
    seamlessNavigate(() => router.back());
  };

  return (
    <div className="fixed inset-0 bg-[#1a1d21]">
      <NotionCanvasFrame
        pageId={pageId}
        mode="full"
        onCollapse={handleCollapse}
      />
      <button
        type="button"
        onClick={handleCollapse}
        title="Collapse"
        aria-label="Collapse"
        className="fixed top-3 right-3 z-50 flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white hover:bg-black/60 transition-colors"
      >
        <Minimize2 className="w-4 h-4" />
      </button>
    </div>
  );
}
