'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { ChevronRight } from 'lucide-react';

export function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const isOpen = (node.attrs['open'] as boolean) ?? true;

  return (
    <NodeViewWrapper>
      <div style={{ margin: '2px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <button
            contentEditable={false}
            onClick={() => updateAttributes({ open: !isOpen })}
            style={{
              flexShrink: 0,
              width: 20,
              height: 20,
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              padding: 0,
              color: 'var(--text-tertiary)',
            }}
          >
            <ChevronRight
              size={14}
              style={{
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: `transform var(--duration-micro) ease`,
              }}
            />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <NodeViewContent
              className={
                isOpen
                  ? 'toggle-content toggle-content--open'
                  : 'toggle-content toggle-content--closed'
              }
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
