'use client';

// Singleton registry of persistent <iframe> nodes keyed by pageId.
// Iframes are appended to <body> and survive React unmount / route change,
// so Hocuspocus WS, Y.js state, scroll, and cursor are preserved across
// panel ↔ full transitions.

interface FrameEntry {
  iframe: HTMLIFrameElement;
  refCount: number;
  observer: ResizeObserver | null;
  scrollListener: (() => void) | null;
  currentEl: HTMLElement | null;
}

const frames = new Map<string, FrameEntry>();

function frameSrc(pageId: string): string {
  return `/notion-embed/pages/${encodeURIComponent(pageId)}`;
}

export function acquire(pageId: string): HTMLIFrameElement {
  let entry = frames.get(pageId);
  if (!entry) {
    const iframe = document.createElement('iframe');
    iframe.src = frameSrc(pageId);
    iframe.dataset.registryId = `notion-${pageId}`;
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.zIndex = '40';
    iframe.style.visibility = 'hidden';
    iframe.style.colorScheme = 'normal';
    iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
    document.body.appendChild(iframe);
    entry = { iframe, refCount: 0, observer: null, scrollListener: null, currentEl: null };
    frames.set(pageId, entry);
  }
  entry.refCount++;
  entry.iframe.style.visibility = 'visible';
  return entry.iframe;
}

export function release(pageId: string): void {
  const entry = frames.get(pageId);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount === 0) {
    entry.iframe.style.visibility = 'hidden';
    detachPlaceholder(pageId);
  }
}

function syncToElement(entry: FrameEntry, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  entry.iframe.style.top = `${r.top}px`;
  entry.iframe.style.left = `${r.left}px`;
  entry.iframe.style.width = `${r.width}px`;
  entry.iframe.style.height = `${r.height}px`;
}

export function bindPlaceholder(
  pageId: string,
  el: HTMLElement,
  vtName: string,
): () => void {
  const entry = frames.get(pageId);
  if (!entry) return () => {};
  detachPlaceholder(pageId);
  entry.currentEl = el;
  entry.iframe.style.viewTransitionName = vtName;
  (el.style as CSSStyleDeclaration).viewTransitionName = vtName;

  const sync = () => requestAnimationFrame(() => syncToElement(entry, el));
  sync();
  const observer = new ResizeObserver(sync);
  observer.observe(el);
  window.addEventListener('resize', sync);
  window.addEventListener('scroll', sync, true);
  entry.observer = observer;
  entry.scrollListener = sync;

  return () => detachPlaceholder(pageId);
}

function detachPlaceholder(pageId: string) {
  const entry = frames.get(pageId);
  if (!entry) return;
  entry.observer?.disconnect();
  if (entry.scrollListener) {
    window.removeEventListener('resize', entry.scrollListener);
    window.removeEventListener('scroll', entry.scrollListener, true);
  }
  if (entry.currentEl) {
    (entry.currentEl.style as CSSStyleDeclaration).viewTransitionName = '';
  }
  entry.observer = null;
  entry.scrollListener = null;
  entry.currentEl = null;
}

export function destroy(pageId: string): void {
  const entry = frames.get(pageId);
  if (!entry) return;
  detachPlaceholder(pageId);
  entry.iframe.remove();
  frames.delete(pageId);
}
