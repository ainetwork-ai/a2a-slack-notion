import type { EditorView } from '@tiptap/pm/view';

export const blockHandleState = {
  hoveredBlockPos: null as number | null,
  hoveredBlockRect: null as DOMRect | null,
  contextMenuOpen: false,
  contextMenuPos: null as { x: number; y: number } | null,
  contextMenuBlockPos: null as number | null,
  editorView: null as EditorView | null,
  selectedBlockPos: null as number | null,
  isDragging: false,
  dragSourcePos: null as number | null,
  /** Updated without notification (high-frequency updates via DOM mutation during drag) */
  dropTargetPos: null as number | null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeBlockHandle(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyBlockHandle() {
  listeners.forEach(fn => fn());
}

export function setHoveredBlock(pos: number | null, rect: DOMRect | null) {
  blockHandleState.hoveredBlockPos = pos;
  blockHandleState.hoveredBlockRect = rect;
  notifyBlockHandle();
}

export function openContextMenu(x: number, y: number, blockPos: number) {
  blockHandleState.contextMenuOpen = true;
  blockHandleState.contextMenuPos = { x, y };
  blockHandleState.contextMenuBlockPos = blockPos;
  notifyBlockHandle();
}

export function closeContextMenu() {
  blockHandleState.contextMenuOpen = false;
  blockHandleState.contextMenuPos = null;
  blockHandleState.contextMenuBlockPos = null;
  notifyBlockHandle();
}

export function selectBlock(pos: number | null) {
  blockHandleState.selectedBlockPos = pos;
  notifyBlockHandle();
}

export function startDrag(pos: number) {
  blockHandleState.isDragging = true;
  blockHandleState.dragSourcePos = pos;
  blockHandleState.dropTargetPos = null;
  notifyBlockHandle();
}

export function endDrag() {
  blockHandleState.isDragging = false;
  blockHandleState.dragSourcePos = null;
  blockHandleState.dropTargetPos = null;
  notifyBlockHandle();
}

export function updateDropTarget(pos: number | null) {
  blockHandleState.dropTargetPos = pos;
  // Don't notify here — drop indicator updates on pointer move, too noisy
}
