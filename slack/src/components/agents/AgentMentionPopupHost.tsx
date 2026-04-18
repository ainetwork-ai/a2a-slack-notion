'use client';

/**
 * AgentMentionPopupHost — singleton popup host for agent `@mentions`
 * rendered inside Tiptap/ProseMirror editors.
 *
 * Mention nodes live inside the ProseMirror DOM (outside the React tree), so
 * we can't simply wrap them in a `<Popover>` trigger. Instead the editor's
 * Mention plugin (see `notion/editor/extensions.ts`) dispatches a window
 * `CustomEvent` on click; this host listens for the event and renders the
 * shared `AgentProfilePopup` anchored to the clicked element.
 *
 * The host self-mounts on import — no consumer needs to add anything to the
 * shell. It's idempotent (only ever mounts one DOM root).
 */
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { AgentProfilePopup } from './AgentProfilePopup';

export interface AgentMentionClickDetail {
  agentId: string;
  agentName: string;
  /** Preferred lookup key (a2aId if available, otherwise the same as agentId). */
  agentKey: string;
  /** Bounding rect of the clicked mention element, in viewport coordinates. */
  rect: { top: number; left: number; bottom: number; right: number; width: number; height: number };
}

export const AGENT_MENTION_CLICK_EVENT = 'notion:agent-mention-click';

/**
 * Internal popup component — opens immediately, closes when the user dismisses
 * it, then unmounts.
 */
function MentionPopup({
  detail,
  onClose,
}: {
  detail: AgentMentionClickDetail;
  onClose: () => void;
}) {
  // The popover from `UserProfilePopup` opens when its trigger button is
  // clicked. We render an invisible 0-size button at the click position and
  // synthesize a click in `useEffect` after mount.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, []);

  // When the popup closes (e.g. outside click), tell the host to unmount.
  useEffect(() => {
    if (!open) {
      // Brief delay so the close animation isn't cut off.
      const t = setTimeout(() => onClose(), 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, onClose]);

  const triggerStyle: React.CSSProperties = {
    position: 'fixed',
    top: detail.rect.top,
    left: detail.rect.left,
    width: detail.rect.width,
    height: detail.rect.height,
    pointerEvents: 'none',
    opacity: 0,
  };

  return (
    <AgentProfilePopup
      agentId={detail.agentId}
      displayName={detail.agentName}
      agentKey={detail.agentKey}
    >
      <button
        type="button"
        style={triggerStyle}
        ref={(el) => {
          if (el && !open) {
            // Programmatically open by dispatching a click on the trigger.
            // The Popover wraps it via PopoverTrigger asChild.
            requestAnimationFrame(() => el.click());
          }
        }}
        onBlur={() => setOpen(false)}
      />
    </AgentProfilePopup>
  );
}

let mounted = false;
let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;

function unmount() {
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
  }
  if (activeContainer && activeContainer.parentNode) {
    activeContainer.parentNode.removeChild(activeContainer);
    activeContainer = null;
  }
}

function show(detail: AgentMentionClickDetail) {
  unmount();
  const container = document.createElement('div');
  container.setAttribute('data-agent-mention-popup-host', '');
  document.body.appendChild(container);
  activeContainer = container;
  activeRoot = createRoot(container);
  activeRoot.render(<MentionPopup detail={detail} onClose={unmount} />);
}

/**
 * Idempotently install the global click listener. Safe to call repeatedly
 * (e.g. from `extensions.ts` import).
 */
export function ensureAgentMentionPopupHost(): void {
  if (typeof window === 'undefined' || mounted) return;
  mounted = true;
  window.addEventListener(AGENT_MENTION_CLICK_EVENT, (event) => {
    const detail = (event as CustomEvent<AgentMentionClickDetail>).detail;
    if (detail && detail.agentId) {
      show(detail);
    }
  });
}

// Auto-install on first import (browser only).
if (typeof window !== 'undefined') {
  ensureAgentMentionPopupHost();
}

/**
 * Render-as-component variant in case a consumer wants to mount the host
 * declaratively. Mounting once is enough — multiple mounts are harmless thanks
 * to the singleton guard.
 */
export function AgentMentionPopupHost(): null {
  useEffect(() => {
    ensureAgentMentionPopupHost();
  }, []);
  return null;
}
