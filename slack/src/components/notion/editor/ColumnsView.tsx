'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function ColumnsView({ node }: NodeViewProps) {
  const columnCount = node.childCount;

  return (
    <NodeViewWrapper
      className="columns-block"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
        gap: 16,
        margin: '4px 0',
      }}
    >
      <NodeViewContent style={{ display: 'contents' }} />
    </NodeViewWrapper>
  );
}
