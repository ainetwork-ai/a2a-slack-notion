'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function ColumnCellView(_props: NodeViewProps) {
  return (
    <NodeViewWrapper className="column-cell" style={{ minWidth: 100, minHeight: 40 }}>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
