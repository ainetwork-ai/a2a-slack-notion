'use client';

import { Extension } from '@tiptap/core';
import { NodeSelection, TextSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { blockHandleState, selectBlock, setHoveredBlock } from './block-handle-state';
import { createBlockAnimationsPlugin } from './block-animations';

const HANDLE_PLUGIN_KEY = new PluginKey('blockHandle');

export const BlockHandleExtension = Extension.create({
  name: 'blockHandle',

  addKeyboardShortcuts() {
    return {
      'Escape': () => {
        const { state, view } = this.editor;
        if (state.selection instanceof NodeSelection) {
          // Already block-selected → exit to text cursor
          const textSel = TextSelection.near(state.doc.resolve(state.selection.from));
          view.dispatch(state.tr.setSelection(textSel));
          selectBlock(null);
          return true;
        }
        // Text cursor → enter block selection
        const { $from } = state.selection;
        const blockPos = $from.depth > 0 ? $from.before($from.depth) : 0;
        try {
          const nodeSel = NodeSelection.create(state.doc, blockPos);
          view.dispatch(state.tr.setSelection(nodeSel));
          selectBlock(blockPos);
          return true;
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('[BlockHandle] Escape NodeSelection failed:', e);
          return false;
        }
      },
      'ArrowUp': () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof NodeSelection)) return false;
        const pos = state.selection.from;
        const $pos = state.doc.resolve(pos);
        const parentDepth = Math.max(0, $pos.depth - 1);
        const indexInParent = $pos.index(parentDepth);
        if (indexInParent === 0) return true; // already first block
        try {
          const parent = $pos.node(parentDepth);
          let prevBlockPos = $pos.start(parentDepth); // start of parent
          for (let i = 0; i < indexInParent - 1; i++) {
            prevBlockPos += parent.child(i).nodeSize;
          }
          const nodeSel = NodeSelection.create(state.doc, prevBlockPos);
          view.dispatch(state.tr.setSelection(nodeSel));
          selectBlock(prevBlockPos);
          return true;
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('[BlockHandle] ArrowUp failed:', e);
          return false;
        }
      },
      'ArrowDown': () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof NodeSelection)) return false;
        const pos = state.selection.from;
        const $pos = state.doc.resolve(pos);
        const parentDepth = Math.max(0, $pos.depth - 1);
        const parent = $pos.node(parentDepth);
        const indexInParent = $pos.index(parentDepth);
        if (indexInParent >= parent.childCount - 1) return true; // already last
        try {
          let nextBlockPos = $pos.start(parentDepth);
          for (let i = 0; i <= indexInParent; i++) {
            nextBlockPos += parent.child(i).nodeSize;
          }
          const nodeSel = NodeSelection.create(state.doc, nextBlockPos);
          view.dispatch(state.tr.setSelection(nodeSel));
          selectBlock(nextBlockPos);
          return true;
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('[BlockHandle] ArrowDown failed:', e);
          return false;
        }
      },
      'Backspace': () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof NodeSelection)) return false;
        const { from, to } = state.selection;
        view.dispatch(state.tr.delete(from, to));
        selectBlock(null);
        return true;
      },
      'Delete': () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof NodeSelection)) return false;
        const { from, to } = state.selection;
        view.dispatch(state.tr.delete(from, to));
        selectBlock(null);
        return true;
      },
      'Enter': () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof NodeSelection)) return false;
        const { from } = state.selection;
        const textSel = TextSelection.near(state.doc.resolve(from + 1));
        view.dispatch(state.tr.setSelection(textSel));
        selectBlock(null);
        return true;
      },
      'Mod-d': () => {
        const { state, view } = this.editor;
        if (!(state.selection instanceof NodeSelection)) return false;
        const { from } = state.selection;
        const node = state.doc.nodeAt(from);
        if (!node) return false;
        const insertPos = from + node.nodeSize;
        const tr = state.tr.insert(insertPos, node.copy(node.content));
        // Select the newly inserted block
        try {
          const newSel = NodeSelection.create(tr.doc, insertPos);
          tr.setSelection(newSel);
          selectBlock(insertPos);
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('[BlockHandle] Mod-d selection failed:', e);
        }
        view.dispatch(tr);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      createBlockAnimationsPlugin(),
      new Plugin({
        key: HANDLE_PLUGIN_KEY,
        view(editorView) {
          blockHandleState.editorView = editorView;
          return {
            destroy() {
              blockHandleState.editorView = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            mouseover(view, event) {
              const target = event.target as HTMLElement;
              const editorDom = view.dom;
              let node: HTMLElement | null = target;
              while (node && node.parentElement !== editorDom) {
                node = node.parentElement;
              }
              if (!node || node === editorDom) {
                if (blockHandleState.hoveredBlockPos !== null) {
                  setHoveredBlock(null, null);
                }
                return false;
              }
              try {
                const pos = view.posAtDOM(node, 0);
                const $pos = view.state.doc.resolve(pos);
                const blockPos = $pos.depth > 0 ? $pos.before($pos.depth) : 0;
                if (blockPos !== blockHandleState.hoveredBlockPos) {
                  setHoveredBlock(blockPos, node.getBoundingClientRect());
                }
              } catch (e) {
                if (process.env.NODE_ENV === 'development') console.warn('[BlockHandle] mouseover failed:', e);
              }
              return false;
            },
            mouseleave(view, event) {
              const related = (event as MouseEvent).relatedTarget as HTMLElement | null;
              if (!related || !view.dom.contains(related)) {
                setHoveredBlock(null, null);
              }
              return false;
            },
            click(_view, event) {
              if (blockHandleState.selectedBlockPos !== null) {
                const target = event.target as HTMLElement;
                if (!target.closest('.block-handle-container') && !target.closest('[data-block-context-menu]')) {
                  selectBlock(null);
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
