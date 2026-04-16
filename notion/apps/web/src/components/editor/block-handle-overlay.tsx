'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, GripVertical } from 'lucide-react';
import { TextSelection } from '@tiptap/pm/state';
import { NodeSelection } from '@tiptap/pm/state';
import { useDraggable } from '@dnd-kit/core';
import { blockHandleState, subscribeBlockHandle, notifyBlockHandle, openContextMenu, selectBlock } from './block-handle-state';

interface HandlePos {
  top: number;
  left: number;
  blockPos: number;
}

export function BlockHandleOverlay() {
  const [handlePos, setHandlePos] = useState<HandlePos | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = subscribeBlockHandle(() => {
      const { hoveredBlockRect, hoveredBlockPos } = blockHandleState;
      if (!hoveredBlockRect || hoveredBlockPos === null) {
        setIsVisible(false);
        // Delay clearing position so fade-out animation completes
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setHandlePos(null), 100);
        return;
      }
      // Compute left: use editor container's left as reference, never go further left than needed
      const editorLeft = blockHandleState.editorView?.dom.getBoundingClientRect().left ?? 0;
      const computedLeft = Math.min(hoveredBlockRect.left - 48, editorLeft - 4);
      setHandlePos({
        top: hoveredBlockRect.top,
        left: computedLeft,
        blockPos: hoveredBlockPos,
      });
      setIsVisible(true);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Gap 2: scroll listener — re-query hovered element rect on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (blockHandleState.hoveredBlockPos !== null && blockHandleState.editorView) {
        const view = blockHandleState.editorView;
        try {
          const dom = view.domAtPos(blockHandleState.hoveredBlockPos + 1);
          let node: HTMLElement | null = dom.node as HTMLElement;
          while (node && node.parentElement !== view.dom) {
            node = node.parentElement;
          }
          if (node) {
            blockHandleState.hoveredBlockRect = node.getBoundingClientRect();
            notifyBlockHandle();
          }
        } catch {
          // ignore stale pos
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  const hoveredBlockPos = handlePos?.blockPos ?? null;
  const draggableId = `block-${hoveredBlockPos ?? 'none'}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    data: { blockPos: hoveredBlockPos },
    disabled: hoveredBlockPos === null,
  });

  if (!handlePos) return null;

  const handleAddClick = () => {
    const view = blockHandleState.editorView;
    if (!view) return;
    const { state, dispatch } = view;
    const node = state.doc.nodeAt(handlePos.blockPos);
    if (!node) return;
    const insertPos = handlePos.blockPos + node.nodeSize;
    const paragraphNode = state.schema.nodes['paragraph'];
    if (!paragraphNode) return;
    const tr = state.tr.insert(insertPos, paragraphNode.create());
    const resolvedPos = tr.doc.resolve(insertPos + 1);
    tr.setSelection(TextSelection.near(resolvedPos));
    dispatch(tr);
    view.focus();
    // Open slash menu after the DOM has updated
    requestAnimationFrame(() => {
      view.dispatch(view.state.tr.insertText('/'));
    });
  };

  const handleDragClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const view = blockHandleState.editorView;
    const pos = handlePos.blockPos;
    if (!view) return;

    try {
      const nodeSel = NodeSelection.create(view.state.doc, pos);
      view.dispatch(view.state.tr.setSelection(nodeSel));
      selectBlock(pos);
      view.focus();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('[BlockHandleOverlay] NodeSelection failed:', err);
    }

    openContextMenu(e.clientX, e.clientY, pos);
  };

  return (
    // Gap 1: opacity transition for smooth 100ms fade-in/out
    <div
      className="block-handle-container"
      style={{
        position: 'fixed',
        top: handlePos.top,
        left: handlePos.left,
        zIndex: 20,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 100ms ease',
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      contentEditable={false}
    >
      <button
        className="block-handle-btn"
        onClick={handleAddClick}
        title="Add block below"
        onMouseDown={e => e.preventDefault()}
      >
        <Plus size={14} />
      </button>
      <button
        ref={setNodeRef}
        className="block-handle-btn block-handle-btn--drag"
        onClick={handleDragClick}
        title="Move, delete, or turn into another block"
        onMouseDown={e => e.preventDefault()}
        style={{ opacity: isDragging ? 0.25 : 1 }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
    </div>
  );
}
