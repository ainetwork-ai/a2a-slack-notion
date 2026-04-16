'use client';

import { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { EditorView } from '@tiptap/pm/view';
import { blockHandleState, startDrag, endDrag, updateDropTarget } from './block-handle-state';

interface BlockDragProviderProps {
  children: React.ReactNode;
}

// Helper: get all top-level block DOM nodes from the editor view
function getTopLevelBlocks(view: EditorView): Array<{ pos: number; dom: HTMLElement }> {
  const blocks: Array<{ pos: number; dom: HTMLElement }> = [];
  view.state.doc.forEach((node, offset) => {
    try {
      const dom = view.nodeDOM(offset) as HTMLElement | null;
      if (dom && dom instanceof HTMLElement) {
        blocks.push({ pos: offset, dom });
      }
    } catch {
      /* skip */
    }
  });
  return blocks;
}

// Helper: find drop target position given pointer Y coordinate
function findDropTarget(
  blocks: Array<{ pos: number; dom: HTMLElement }>,
  pointerY: number,
  sourcePos: number,
): number | null {
  if (blocks.length === 0) return null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    if (block.pos === sourcePos) continue; // skip source block
    const rect = block.dom.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (pointerY < midY) {
      // Drop before this block — find the last non-source block before this one
      let prevIdx = i - 1;
      while (prevIdx >= 0 && blocks[prevIdx]?.pos === sourcePos) prevIdx--;
      return prevIdx < 0 ? -1 : blocks[prevIdx]!.pos; // -1 means "insert at top"
    }
  }
  // Drop after last block — find the last non-source block
  let lastIdx = blocks.length - 1;
  while (lastIdx >= 0 && blocks[lastIdx]?.pos === sourcePos) lastIdx--;
  if (lastIdx < 0) return null;
  return blocks[lastIdx]!.pos;
}

export function BlockDragProvider({ children }: BlockDragProviderProps) {
  const [draggedContent, setDraggedContent] = useState<string>('');
  const dropIndicatorRef = useRef<HTMLDivElement>(null);
  // Gap 2: track editor container to add/remove is-dragging class
  const editorContainerRef = useRef<HTMLElement | null>(null);

  // Gap 3: keyboard coordinate getter for ArrowUp/Down block navigation
  const blockKeyboardCoordinates: KeyboardCoordinateGetter = useCallback(
    (event, { currentCoordinates }) => {
      const view = blockHandleState.editorView;
      const sourcePos = blockHandleState.dragSourcePos;
      if (!view || sourcePos === null) return currentCoordinates;

      const blocks = getTopLevelBlocks(view);
      const sourceIdx = blocks.findIndex(b => b.pos === sourcePos);
      if (sourceIdx === -1) return currentCoordinates;

      let targetIdx = sourceIdx;
      if (event.code === 'ArrowDown') targetIdx = Math.min(blocks.length - 1, sourceIdx + 1);
      if (event.code === 'ArrowUp') targetIdx = Math.max(0, sourceIdx - 1);

      const targetBlock = blocks[targetIdx];
      if (!targetBlock) return currentCoordinates;

      const rect = targetBlock.dom.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: blockKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const pos = event.active.data.current?.blockPos as number | undefined;
    if (pos === null || pos === undefined) return;

    startDrag(pos);

    // Capture block text content for overlay
    const view = blockHandleState.editorView;
    if (view) {
      const node = view.state.doc.nodeAt(pos);
      setDraggedContent(node?.textContent ?? '');

      // Gap 1: Mark source block as dragging for CSS opacity placeholder
      try {
        const dom = view.nodeDOM(pos) as HTMLElement | null;
        if (dom) dom.setAttribute('data-dragging', 'true');
      } catch { /* ignore */ }

      // Gap 2: Add is-dragging class to editor container for transition CSS
      const container = view.dom.closest('.notion-editor') as HTMLElement | null;
      if (container) {
        editorContainerRef.current = container;
        container.classList.add('is-dragging');
      }
    }
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const view = blockHandleState.editorView;
    const sourcePos = blockHandleState.dragSourcePos;
    if (!view || sourcePos === null) return;

    const blocks = getTopLevelBlocks(view);
    const pointerY =
      event.activatorEvent instanceof MouseEvent
        ? event.activatorEvent.clientY + event.delta.y
        : 0;

    const dropPos = findDropTarget(blocks, pointerY, sourcePos);
    updateDropTarget(dropPos);

    // Update drop indicator DOM directly (avoid React re-render on every mousemove)
    if (dropIndicatorRef.current && dropPos !== null) {
      const targetBlock =
        dropPos === -1 ? blocks[0] : blocks.find(b => b.pos === dropPos);
      if (targetBlock) {
        const rect = targetBlock.dom.getBoundingClientRect();
        const top = dropPos === -1 ? rect.top : rect.bottom;
        const editorRect = view.dom.getBoundingClientRect();
        const editorLeft = editorRect.left;
        const editorWidth = editorRect.width;
        dropIndicatorRef.current.style.top = `${top - 1}px`;
        dropIndicatorRef.current.style.left = `${editorLeft}px`;
        dropIndicatorRef.current.style.width = `${editorWidth}px`;
        dropIndicatorRef.current.style.right = 'auto';
        dropIndicatorRef.current.style.display = 'block';
      }
    }
  }, []);

  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    const view = blockHandleState.editorView;
    // Gap 1: capture sourcePos BEFORE endDrag() clears it
    const sourcePos = blockHandleState.dragSourcePos;
    const dropPos = blockHandleState.dropTargetPos;

    // Hide indicator
    if (dropIndicatorRef.current) {
      dropIndicatorRef.current.style.display = 'none';
    }

    endDrag();

    // Gap 1: Remove data-dragging attribute from source block
    if (view && sourcePos !== null) {
      try {
        const dom = view.nodeDOM(sourcePos) as HTMLElement | null;
        if (dom) dom.removeAttribute('data-dragging');
      } catch { /* ignore */ }
    }

    // Gap 2: Remove is-dragging class from editor container
    editorContainerRef.current?.classList.remove('is-dragging');

    if (!view || sourcePos === null || dropPos === undefined || dropPos === null) return;

    const state = view.state;
    const node = state.doc.nodeAt(sourcePos);
    if (!node) return;

    const from = sourcePos;
    const to = from + node.nodeSize;

    // Compute insert position BEFORE deletion so we can use mapping
    let rawInsertPos: number;
    if (dropPos === -1) {
      rawInsertPos = 0;
    } else {
      const targetNode = state.doc.nodeAt(dropPos);
      rawInsertPos = dropPos + (targetNode?.nodeSize ?? 0);
    }

    // Guard: same logical position (no-op)
    if (rawInsertPos === from || rawInsertPos === to) return;
    // Guard: inserting inside the source node (should not happen with top-level blocks)
    if (rawInsertPos > from && rawInsertPos < to) return;

    try {
      const nodeContent = node.copy(node.content);
      let tr = state.tr;

      if (sourcePos < rawInsertPos) {
        // Moving DOWN: delete first, then use mapping to find correct insert position
        tr = tr.delete(from, to);
        const mappedInsert = tr.mapping.map(rawInsertPos);
        // Validate the mapped position
        const $mapped = tr.doc.resolve(Math.min(mappedInsert, tr.doc.content.size));
        if ($mapped.depth !== 0 && mappedInsert !== 0) {
          if (process.env.NODE_ENV === 'development')
            console.warn('[BlockDrag] invalid insert position after mapping:', mappedInsert);
          return;
        }
        tr = tr.insert(mappedInsert, nodeContent);
      } else {
        // Moving UP: delete first, then insert at rawInsertPos (which doesn't shift since it's before source)
        tr = tr.delete(from, to);
        // Validate target position exists in new doc
        const $target = tr.doc.resolve(Math.min(rawInsertPos, tr.doc.content.size));
        if ($target.depth !== 0 && rawInsertPos !== 0) {
          if (process.env.NODE_ENV === 'development')
            console.warn('[BlockDrag] invalid insert position:', rawInsertPos);
          return;
        }
        tr = tr.insert(rawInsertPos, nodeContent);
      }

      view.dispatch(tr);
    } catch (e) {
      if (process.env.NODE_ENV === 'development')
        console.warn('[BlockDrag] move transaction failed:', e);
    }
  }, []);

  const handleDragCancel = useCallback(() => {
    // Gap 1: capture sourcePos BEFORE endDrag() clears it
    const sourcePos = blockHandleState.dragSourcePos;
    const view = blockHandleState.editorView;

    if (dropIndicatorRef.current) {
      dropIndicatorRef.current.style.display = 'none';
    }
    endDrag();

    // Gap 1: Remove data-dragging attribute from source block
    if (view && sourcePos !== null) {
      try {
        const dom = view.nodeDOM(sourcePos) as HTMLElement | null;
        if (dom) dom.removeAttribute('data-dragging');
      } catch { /* ignore */ }
    }

    // Gap 2: Remove is-dragging class from editor container
    editorContainerRef.current?.classList.remove('is-dragging');
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}

      {/* Drop indicator line — left/width set dynamically in handleDragMove */}
      <div
        ref={dropIndicatorRef}
        style={{
          position: 'fixed',
          left: 0,
          width: '100%',
          height: 2,
          backgroundColor: 'var(--accent-blue)',
          display: 'none',
          pointerEvents: 'none',
          zIndex: 30,
          borderRadius: 1,
        }}
      />

      {/* Drag overlay: floating ghost of dragged block */}
      <DragOverlay
        dropAnimation={{
          duration: 150,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}
      >
        {blockHandleState.isDragging ? (
          <div
            style={{
              padding: '4px 12px',
              background: 'var(--bg-default)',
              boxShadow: 'var(--shadow-menu)',
              borderRadius: 'var(--radius-md)',
              opacity: 0.85,
              transform: 'rotate(1.5deg)',
              fontSize: 14,
              color: 'var(--text-primary)',
              maxWidth: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {draggedContent || '...'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
