import { Plugin, PluginKey } from '@tiptap/pm/state';

const ANIMATION_DURATION_SHORT = 150;

// Map from DOM element to timeout ID, for cleanup
const animationTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function createBlockAnimationsPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('blockAnimations'),
    view(editorView) {
      return {
        update(view, prevState) {
          if (view.state.doc.eq(prevState.doc)) return;

          // Build set of existing node references from old doc
          const oldNodes = new Set<import('@tiptap/pm/model').Node>();
          prevState.doc.forEach((node) => oldNodes.add(node));

          // Find truly new nodes (not in old doc at all)
          view.state.doc.forEach((node, offset) => {
            if (!oldNodes.has(node)) {
              // Truly new block — animate it
              try {
                const dom = view.nodeDOM(offset) as HTMLElement | null;
                if (dom instanceof HTMLElement) {
                  const existingTimer = animationTimers.get(dom);
                  if (existingTimer) clearTimeout(existingTimer);
                  dom.classList.add('block-just-created');
                  const timer = setTimeout(() => {
                    dom.classList.remove('block-just-created');
                  }, ANIMATION_DURATION_SHORT);
                  animationTimers.set(dom, timer);
                }
              } catch (e) {
                if (process.env.NODE_ENV === 'development') console.warn('[BlockAnimation] detection error:', e);
              }
            }
          });
        },
        destroy() { /* WeakMap entries are GC'd automatically */ },
      };
    },
  });
}

/**
 * Delete a block at the given position with a fade-out animation.
 * Applies .block-deleting class, waits 150ms for animation, then dispatches the delete.
 * Re-locates the node by identity after the timeout to handle stale positions.
 */
export function deleteBlockWithAnimation(view: import('@tiptap/pm/view').EditorView, pos: number): void {
  const state = view.state;
  const node = state.doc.nodeAt(pos);
  if (!node) return;

  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (!dom) {
    // No DOM — delete immediately
    const to = pos + node.nodeSize;
    view.dispatch(state.tr.delete(pos, to));
    return;
  }

  // Snapshot the node reference for re-identification after animation
  const nodeSnapshot = node;

  dom.classList.add('block-deleting');

  setTimeout(() => {
    const currentState = view.state;
    // Re-locate the node: walk top-level blocks to find same node by identity
    let targetPos: number | null = null;
    currentState.doc.forEach((child, offset) => {
      if (child === nodeSnapshot) {
        targetPos = offset;
      }
    });

    if (targetPos === null) return; // node already gone (deleted by other means)

    try {
      view.dispatch(currentState.tr.delete(targetPos, targetPos + nodeSnapshot.nodeSize));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[BlockAnimation] delete failed:', e);
    }
  }, ANIMATION_DURATION_SHORT);
}
