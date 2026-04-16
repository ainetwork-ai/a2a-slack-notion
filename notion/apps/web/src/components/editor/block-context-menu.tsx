'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Trash2, Copy, ArrowRightLeft, Link, CornerUpRight, MessageSquare, Palette, ChevronRight } from 'lucide-react';
import { TextSelection } from '@tiptap/pm/state';
import { wrapIn } from '@tiptap/pm/commands';
import { blockHandleState, subscribeBlockHandle, closeContextMenu } from './block-handle-state';
import { deleteBlockWithAnimation } from './block-animations';

const LIST_NODE_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

const TURN_INTO_TYPES: Array<{ label: string; nodeType: string; attrs?: Record<string, unknown>; disabled?: boolean }> = [
  { label: 'Text', nodeType: 'paragraph' },
  { label: 'Heading 1', nodeType: 'heading', attrs: { level: 1 } },
  { label: 'Heading 2', nodeType: 'heading', attrs: { level: 2 } },
  { label: 'Heading 3', nodeType: 'heading', attrs: { level: 3 } },
  { label: 'Bullet list', nodeType: 'bulletList' },
  { label: 'Numbered list', nodeType: 'orderedList' },
  { label: 'To-do list', nodeType: 'taskList' },
  { label: 'Quote', nodeType: 'blockquote' },
  { label: 'Code', nodeType: 'codeBlock' },
];

const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Gray', value: '#787774' },
  { label: 'Brown', value: '#9f6b53' },
  { label: 'Orange', value: '#d9730d' },
  { label: 'Yellow', value: '#cb912f' },
  { label: 'Green', value: '#448361' },
  { label: 'Blue', value: '#337ea9' },
  { label: 'Purple', value: '#9065b0' },
  { label: 'Pink', value: '#c14c8a' },
  { label: 'Red', value: '#eb5757' },
];

const BG_COLORS = [
  { label: 'Default', value: null },
  { label: 'Gray', value: 'rgba(120,119,116,0.15)' },
  { label: 'Brown', value: 'rgba(159,107,83,0.15)' },
  { label: 'Orange', value: 'rgba(217,115,13,0.15)' },
  { label: 'Yellow', value: 'rgba(203,145,47,0.15)' },
  { label: 'Green', value: 'rgba(68,131,97,0.15)' },
  { label: 'Blue', value: 'rgba(51,126,169,0.15)' },
  { label: 'Purple', value: 'rgba(144,101,176,0.15)' },
  { label: 'Pink', value: 'rgba(193,76,138,0.15)' },
  { label: 'Red', value: 'rgba(235,87,87,0.15)' },
];

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 28,
  padding: '0 12px',
  margin: '0 4px',
  fontSize: 14,
  color: 'var(--text-primary)',
  borderRadius: 3,
  cursor: 'pointer',
  width: 'calc(100% - 8px)',
  background: 'none',
  border: 'none',
  fontFamily: 'inherit',
  textAlign: 'left',
};

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...itemStyle,
        background: hovered && !disabled ? 'var(--bg-hover)' : 'transparent',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={() => { if (!disabled) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      onClick={disabled ? undefined : onClick}
    >
      <Icon size={16} color="var(--text-tertiary)" />
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

export function BlockContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [blockPos, setBlockPos] = useState<number | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'turnInto' | 'color' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeBlockHandle(() => {
      const s = blockHandleState;
      if (s.contextMenuOpen && s.contextMenuPos) {
        setIsOpen(true);
        setPos(s.contextMenuPos);
        setBlockPos(s.contextMenuBlockPos);
        setActiveSubmenu(null);
      } else if (!s.contextMenuOpen) {
        setIsOpen(false);
      }
    });
    return unsub;
  }, []);

  // Gap 6: wrap close in useCallback so it is stable across renders
  const close = useCallback(() => {
    closeContextMenu();
    setIsOpen(false);
    setActiveSubmenu(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Clamp menu position to viewport bounds after render
  useEffect(() => {
    if (!menuRef.current || !isOpen) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth) {
      el.style.left = `${pos.x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${pos.y - rect.height}px`;
    }
  }, [isOpen, pos]);

  if (!isOpen) return null;

  const view = blockHandleState.editorView;

  const handleDelete = () => {
    if (!view || blockPos === null) return;
    deleteBlockWithAnimation(view, blockPos);
    close();
  };

  const handleDuplicate = () => {
    if (!view || blockPos === null) return;
    const node = view.state.doc.nodeAt(blockPos);
    if (!node) return;
    const insertPos = blockPos + node.nodeSize;
    view.dispatch(view.state.tr.insert(insertPos, node.copy(node.content)));
    close();
  };

  const handleCopyLink = () => {
    const url = window.location.href.split('#')[0] + '#block-' + blockPos;
    navigator.clipboard.writeText(url).catch(() => {});
    close();
  };

  const handleTurnInto = (nodeType: string, attrs?: Record<string, unknown>) => {
    if (!view || blockPos === null) return;
    const { state } = view;
    const node = state.doc.nodeAt(blockPos);
    if (!node) { close(); return; }

    // Gap 4: Enable list types via wrapIn (ProseMirror command)
    if (LIST_NODE_TYPES.has(nodeType)) {
      const listType = state.schema.nodes[nodeType];
      if (!listType) {
        console.warn(`[BlockContextMenu] ${nodeType} not in schema`);
        close();
        return;
      }

      try {
        // Select the whole block content, then wrap in list
        const from = blockPos + 1;
        const to = blockPos + node.nodeSize - 1;
        if (from < to) {
          const selTr = state.tr.setSelection(
            TextSelection.create(state.doc, from, to)
          );
          view.dispatch(selTr);
          wrapIn(listType)(view.state, view.dispatch);
        }
      } catch (e) {
        console.warn(`[BlockContextMenu] wrapIn ${nodeType} failed:`, e);
      }
      close();
      return;
    }

    const type = state.schema.nodes[nodeType];
    if (!type) { close(); return; }

    try {
      const tr = state.tr.setNodeMarkup(blockPos, type, { ...node.attrs, ...(attrs ?? {}) });
      view.dispatch(tr);
    } catch (e) {
      console.warn('setNodeMarkup failed:', e);
    }
    close();
  };

  const handleTextColor = (color: string | null) => {
    if (view && blockPos !== null) {
      const { state, dispatch } = view;
      const node = state.doc.nodeAt(blockPos);
      if (node) {
        const textStyleMark = state.schema.marks['textStyle'];
        if (textStyleMark) {
          const from = blockPos + 1;
          const to = blockPos + node.nodeSize - 1;
          const tr = color
            ? state.tr.addMark(from, to, textStyleMark.create({ color }))
            : state.tr.removeMark(from, to, textStyleMark);
          dispatch(tr);
        } else {
          console.warn('textStyle mark not available in schema');
        }
      }
    }
    close();
  };

  // Gap 3: background color via textStyle mark instead of non-functional setNodeMarkup
  const handleBgColor = (color: string | null) => {
    if (view && blockPos !== null) {
      const { state, dispatch } = view;
      const node = state.doc.nodeAt(blockPos);
      if (node) {
        const from = blockPos + 1;
        const to = blockPos + node.nodeSize - 1;

        if (from < to) {
          const textStyleMark = state.schema.marks['textStyle'];
          if (textStyleMark) {
            try {
              const tr = color
                ? state.tr.addMark(from, to, textStyleMark.create({ backgroundColor: color }))
                : state.tr.removeMark(from, to, textStyleMark);
              dispatch(tr);
            } catch (e) {
              console.warn('[BlockContextMenu] background color via textStyle failed:', e);
            }
          } else {
            console.warn('[BlockContextMenu] textStyle mark not available — cannot apply background color');
          }
        }
      }
    }
    close();
  };

  // Gap 5: context menu at zIndex 30 (above handle at 20, below collaborative cursors at 100)
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.y,
    left: pos.x,
    minWidth: 260,
    maxHeight: '70vh',
    overflowY: 'auto',
    background: 'var(--bg-default)',
    boxShadow: 'var(--shadow-menu)',
    borderRadius: 'var(--radius-md)',
    padding: '4px 0',
    zIndex: 30,
    animation: 'menu-fade-in 150ms ease-out',
  };

  return (
    <div ref={menuRef} style={menuStyle} data-block-context-menu>
      <MenuItem icon={Trash2} label="Delete" shortcut="Del" onClick={handleDelete} />
      <MenuItem icon={Copy} label="Duplicate" shortcut="Ctrl+D" onClick={handleDuplicate} />

      <div style={{ position: 'relative' }}>
        <SubmenuTrigger
          icon={ArrowRightLeft}
          label="Turn into"
          active={activeSubmenu === 'turnInto'}
          onToggle={() => setActiveSubmenu(activeSubmenu === 'turnInto' ? null : 'turnInto')}
        />
        {activeSubmenu === 'turnInto' && (
          <div style={{ ...menuStyle, position: 'absolute', top: 0, left: '100%', margin: 0 }}>
            {TURN_INTO_TYPES.map(({ label, nodeType, attrs, disabled }) => (
              <TurnIntoItem
                key={label}
                label={label}
                disabled={disabled}
                onClick={() => handleTurnInto(nodeType, attrs)}
              />
            ))}
          </div>
        )}
      </div>

      <MenuItem icon={Link} label="Copy link to block" onClick={handleCopyLink} />
      <MenuItem icon={CornerUpRight} label="Move to" shortcut="soon" disabled />
      <MenuItem icon={MessageSquare} label="Comment" disabled />

      <div style={{ height: 1, background: 'var(--divider)', margin: '4px 0' }} />

      <div style={{ position: 'relative' }}>
        <SubmenuTrigger
          icon={Palette}
          label="Color"
          active={activeSubmenu === 'color'}
          onToggle={() => setActiveSubmenu(activeSubmenu === 'color' ? null : 'color')}
        />
        {activeSubmenu === 'color' && (
          <div style={{ ...menuStyle, position: 'absolute', top: 0, left: '100%', margin: 0, minWidth: 220 }}>
            <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>COLOR</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 12px 8px' }}>
              {TEXT_COLORS.map(({ label, value }) => (
                <button
                  key={label}
                  title={label}
                  onClick={() => handleTextColor(value)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 3,
                    background: value ?? 'var(--bg-hover)',
                    border: '1px solid var(--divider)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: value ?? 'var(--text-primary)',
                  }}
                >
                  A
                </button>
              ))}
            </div>
            <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BACKGROUND</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 12px 8px' }}>
              {BG_COLORS.map(({ label, value }) => (
                <button
                  key={label}
                  title={label}
                  onClick={() => handleBgColor(value)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 3,
                    background: value ?? 'var(--bg-hover)',
                    border: '1px solid var(--divider)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Internal helper components — not exported

function SubmenuTrigger({
  icon: Icon,
  label,
  active,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...itemStyle,
        background: hovered || active ? 'var(--bg-hover)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
    >
      <Icon size={16} color="var(--text-tertiary)" />
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={12} style={{ color: 'var(--text-tertiary)' }} />
    </button>
  );
}

function TurnIntoItem({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        ...itemStyle,
        background: hovered && !disabled ? 'var(--bg-hover)' : 'transparent',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={() => { if (!disabled) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  );
}
