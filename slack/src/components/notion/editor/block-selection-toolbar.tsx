'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trash2, Copy, Palette, ArrowRightLeft } from 'lucide-react';
import { NodeSelection } from '@tiptap/pm/state';
import { blockHandleState, subscribeBlockHandle, selectBlock } from './block-handle-state';

export function BlockSelectionToolbar() {
  const [isVisible, setIsVisible] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeBlockHandle(() => {
      const pos = blockHandleState.selectedBlockPos;
      const view = blockHandleState.editorView;

      if (pos === null || !view) {
        setIsVisible(false);
        setToolbarPos(null);
        return;
      }

      try {
        const dom = view.nodeDOM(pos) as HTMLElement | null;
        if (dom) {
          const rect = dom.getBoundingClientRect();
          setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
          setIsVisible(true);
        }
      } catch {
        setIsVisible(false);
      }
    });
    return unsubscribe;
  }, []);

  const handleDelete = useCallback(() => {
    const view = blockHandleState.editorView;
    const pos = blockHandleState.selectedBlockPos;
    if (!view || pos === null) return;
    const state = view.state;
    if (state.selection instanceof NodeSelection) {
      view.dispatch(state.tr.delete(state.selection.from, state.selection.to));
    }
    selectBlock(null);
  }, []);

  const handleDuplicate = useCallback(() => {
    const view = blockHandleState.editorView;
    const pos = blockHandleState.selectedBlockPos;
    if (!view || pos === null) return;
    const state = view.state;
    const node = state.doc.nodeAt(pos);
    if (!node) return;
    const insertPos = pos + node.nodeSize;
    view.dispatch(state.tr.insert(insertPos, node.copy(node.content)));
  }, []);

  if (!isVisible || !toolbarPos) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: toolbarPos.x,
        top: toolbarPos.y,
        transform: 'translate(-50%, -100%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 6px',
        background: 'var(--bg-default)',
        boxShadow: 'var(--shadow-menu)',
        borderRadius: 'var(--radius-md)',
        animation: 'menu-fade-in 150ms ease-out',
      }}
    >
      <ToolbarButton icon={Trash2} label="Delete" onClick={handleDelete} />
      <ToolbarButton icon={Copy} label="Duplicate" onClick={handleDuplicate} />
      <div style={{ width: 1, height: 16, background: 'var(--divider)', margin: '0 2px' }} />
      <ToolbarButton icon={ArrowRightLeft} label="Turn into" onClick={() => {}} disabled />
      <ToolbarButton icon={Palette} label="Color" onClick={() => {}} disabled />
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={disabled ? `${label} (coming soon)` : label}
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        background: 'transparent',
        color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
      onMouseEnter={e => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <Icon size={14} />
    </button>
  );
}
