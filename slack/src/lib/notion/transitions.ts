/**
 * Seamless panel ↔ full-page transitions using the View Transitions API.
 *
 * The editor body carries `view-transition-name: canvas-body-${pageId}` in both
 * panel and full modes — same name = same element in the eyes of the transition
 * engine, so it animates from 320px sidebar to centered column in one flight.
 *
 * Chrome (sidebar, pipeline stepper, toolbars) crossfades independently via
 * ::view-transition-old(root) / ::view-transition-new(root) in globals.css.
 *
 * Falls back to instant navigation on browsers without the API (Firefox ≤ ~127).
 */

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
};

export function bodyTransitionName(pageId: string): string {
  return `canvas-body-${pageId}`;
}

export async function seamlessNavigate(cb: () => void | Promise<void>): Promise<void> {
  const d = document as ViewTransitionDocument;
  if (typeof d.startViewTransition !== 'function' || matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    await cb();
    return;
  }
  await d.startViewTransition(cb).finished;
}

/**
 * Scroll-ratio preservation across the transition. Call `capture()` before
 * navigation; pass the result to `restore()` once the new route has mounted the
 * editor body.
 */
export function captureScrollRatio(el: HTMLElement | null): number {
  if (!el) return 0;
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

export function restoreScrollRatio(el: HTMLElement | null, ratio: number): void {
  if (!el || !Number.isFinite(ratio)) return;
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.round(max * ratio);
}
