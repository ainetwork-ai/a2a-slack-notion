import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ToggleView } from './ToggleView';

export const ToggleExtension = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'details[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
