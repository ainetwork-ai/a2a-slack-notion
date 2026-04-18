import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ColumnsView } from './columns-view';
import { ColumnCellView } from './column-cell-view';

export const ColumnsExtension = Node.create({
  name: 'columns',
  group: 'block',
  content: 'columnCell+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnsView);
  },
});

export const ColumnCellExtension = Node.create({
  name: 'columnCell',
  group: 'columnCell',
  content: 'block+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column-cell"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column-cell' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnCellView);
  },
});
