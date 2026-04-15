'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const HANDLE_PLUGIN_KEY = new PluginKey('blockHandle');

/**
 * Creates a drag handle DOM element for a given block node.
 * The handle is absolutely positioned to the left of the block.
 */
function createHandleElement(view: EditorView, pos: number): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'block-drag-handle';
  handle.setAttribute('draggable', 'true');
  handle.setAttribute('data-drag-handle', '');
  handle.contentEditable = 'false';

  // Grip icon (⠿ braille pattern — common drag grip)
  handle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="2" cy="2" r="1.5"/>
    <circle cx="8" cy="2" r="1.5"/>
    <circle cx="2" cy="7" r="1.5"/>
    <circle cx="8" cy="7" r="1.5"/>
    <circle cx="2" cy="12" r="1.5"/>
    <circle cx="8" cy="12" r="1.5"/>
  </svg>`;

  // Context menu state
  let menuEl: HTMLElement | null = null;

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    document.removeEventListener('mousedown', onDocClick);
  }

  function onDocClick(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node) && !handle.contains(e.target as Node)) {
      closeMenu();
    }
  }

  handle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (menuEl) {
      closeMenu();
      return;
    }

    // Resolve the node at pos to get its size for delete/duplicate
    const resolvedPos = view.state.doc.resolve(pos);
    const node: ProseMirrorNode | null = view.state.doc.nodeAt(pos) ?? null;

    menuEl = document.createElement('div');
    menuEl.className = 'block-handle-menu';

    const items: Array<{ label: string; action: () => void }> = [
      {
        label: 'Delete',
        action: () => {
          if (node) {
            const tr = view.state.tr.delete(pos, pos + node.nodeSize);
            view.dispatch(tr);
          }
          closeMenu();
        },
      },
      {
        label: 'Duplicate',
        action: () => {
          if (node) {
            const insertPos = pos + node.nodeSize;
            const tr = view.state.tr.insert(insertPos, node.copy(node.content));
            view.dispatch(tr);
          }
          closeMenu();
        },
      },
      {
        label: 'Turn into…',
        action: () => {
          // Placeholder — slash command handles block type switching
          closeMenu();
        },
      },
    ];

    items.forEach(({ label, action }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.className = 'block-handle-menu-item';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        action();
      });
      menuEl!.appendChild(btn);
    });

    handle.appendChild(menuEl);
    document.addEventListener('mousedown', onDocClick);
  });

  // Native drag: set transfer data to the block position so drop handler can reorder
  handle.addEventListener('dragstart', (e) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pos));

    // Highlight the dragging node
    const node = view.state.doc.nodeAt(pos);
    if (node) {
      const domNode = view.nodeDOM(pos) as HTMLElement | null;
      if (domNode) {
        domNode.style.opacity = '0.5';
        const dragend = () => {
          domNode.style.opacity = '';
          handle.removeEventListener('dragend', dragend);
        };
        handle.addEventListener('dragend', dragend);
      }
    }
  });

  return handle;
}

export const BlockHandleExtension = Extension.create({
  name: 'blockHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: HANDLE_PLUGIN_KEY,
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            // Add a widget decoration at the start of each top-level block
            doc.forEach((node, offset) => {
              if (node.type.name === 'doc') return;

              decorations.push(
                Decoration.widget(offset, (view) => {
                  return createHandleElement(view, offset);
                }, {
                  side: -1,
                  key: `block-handle-${offset}`,
                }),
              );
            });

            return DecorationSet.create(doc, decorations);
          },

          handleDrop(view, event) {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer) return false;

            const fromPosStr = dataTransfer.getData('text/plain');
            if (!fromPosStr) return false;

            const fromPos = parseInt(fromPosStr, 10);
            if (isNaN(fromPos)) return false;

            event.preventDefault();

            const coords = { left: event.clientX, top: event.clientY };
            const dropTarget = view.posAtCoords(coords);
            if (!dropTarget) return false;

            const { state, dispatch } = view;
            const fromNode = state.doc.nodeAt(fromPos);
            if (!fromNode) return false;

            let toPos = dropTarget.pos;

            // Resolve to top-level position
            const $to = state.doc.resolve(toPos);
            toPos = $to.before(1);

            if (fromPos === toPos) return false;

            const tr = state.tr;

            if (fromPos < toPos) {
              tr.insert(toPos + fromNode.nodeSize, fromNode.copy(fromNode.content));
              tr.delete(fromPos, fromPos + fromNode.nodeSize);
            } else {
              tr.delete(fromPos, fromPos + fromNode.nodeSize);
              tr.insert(toPos, fromNode.copy(fromNode.content));
            }

            dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
