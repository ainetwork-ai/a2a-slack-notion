'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Image,
  Table,
  Sigma,
  GitBranch,
  Globe,
  Info,
  ChevronRight,
  Columns2,
  Columns3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ElementType;
  command: (editor: Editor) => void;
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: 'Text',
    description: 'Plain text block',
    icon: Type,
    command: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    icon: Heading1,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    icon: Heading2,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: Heading3,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'To-do List',
    description: 'Checklist with tasks',
    icon: CheckSquare,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Quote',
    description: 'Blockquote',
    icon: Quote,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Code',
    description: 'Code block with syntax highlighting',
    icon: Code,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    icon: Minus,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Callout',
    description: 'Highlight important information',
    icon: Info,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'callout',
          attrs: { emoji: '💡' },
          content: [{ type: 'paragraph' }],
        })
        .run(),
  },
  {
    title: 'Toggle List',
    description: 'Collapsible toggle block',
    icon: ChevronRight,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'toggle',
          attrs: { open: true },
          content: [{ type: 'paragraph' }],
        })
        .run(),
  },
  {
    title: '2 Columns',
    description: 'Two-column layout',
    icon: Columns2,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'columns',
          attrs: { columns: 2 },
          content: [
            { type: 'columnCell', content: [{ type: 'paragraph' }] },
            { type: 'columnCell', content: [{ type: 'paragraph' }] },
          ],
        })
        .run(),
  },
  {
    title: '3 Columns',
    description: 'Three-column layout',
    icon: Columns3,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'columns',
          attrs: { columns: 3 },
          content: [
            { type: 'columnCell', content: [{ type: 'paragraph' }] },
            { type: 'columnCell', content: [{ type: 'paragraph' }] },
            { type: 'columnCell', content: [{ type: 'paragraph' }] },
          ],
        })
        .run(),
  },
  {
    title: 'Image',
    description: 'Upload or embed an image',
    icon: Image,
    command: (editor) => {
      const url = window.prompt('Image URL');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    title: 'Table',
    description: 'Insert a table',
    icon: Table,
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'Math Equation',
    description: 'KaTeX formula block',
    icon: Sigma,
    command: (editor) =>
      editor.chain().focus().insertContent({ type: 'codeBlock', attrs: { language: 'latex' }, content: [{ type: 'text', text: 'E = mc^2' }] }).run(),
  },
  {
    title: 'Mermaid Diagram',
    description: 'Code-to-diagram block',
    icon: GitBranch,
    command: (editor) =>
      editor.chain().focus().insertContent({ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'graph TD\n  A-->B' }] }).run(),
  },
  {
    title: 'Embed',
    description: 'YouTube, Figma, CodePen, etc.',
    icon: Globe,
    command: (editor) => {
      const url = window.prompt('Embed URL');
      if (url) {
        editor.chain().focus().insertContent(`<p><a href="${url}">${url}</a></p>`).run();
      }
    },
  },
];

interface SlashCommandMenuProps {
  editor: Editor;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  );

  const executeCommand = useCallback(
    (index: number) => {
      const cmd = filtered[index];
      if (cmd) {
        // Delete the slash and query text
        const { from } = editor.state.selection;
        const textBefore = editor.state.doc.textBetween(
          Math.max(0, from - query.length - 1),
          from,
          '',
        );
        const slashPos = textBefore.lastIndexOf('/');
        if (slashPos >= 0) {
          const deleteFrom = from - query.length - 1;
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
        }
        cmd.command(editor);
        setIsOpen(false);
        setQuery('');
      }
    },
    [editor, filtered, query],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCommand(selectedIndex);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, selectedIndex, filtered.length, executeCommand]);

  useEffect(() => {
    function handleUpdate() {
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 50),
        from,
        '\n',
      );

      const match = textBefore.match(/\/([^\s/]*)$/);
      if (match) {
        setQuery(match[1] ?? '');
        setIsOpen(true);
        setSelectedIndex(0);

        // Position the menu near the cursor
        const coords = editor.view.coordsAtPos(from);
        const editorRect = editor.view.dom.getBoundingClientRect();
        setPosition({
          top: coords.bottom - editorRect.top + 4,
          left: coords.left - editorRect.left,
        });
      } else {
        setIsOpen(false);
        setQuery('');
      }
    }

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-[var(--z-slash-menu)] w-[300px] max-h-[320px] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-1"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((cmd, i) => (
        <button
          key={cmd.title}
          onClick={() => executeCommand(i)}
          className={cn(
            'flex items-center gap-3 w-full px-2 py-1.5 rounded-[var(--radius-sm)] text-left transition-colors duration-[var(--duration-micro)]',
            i === selectedIndex
              ? 'bg-[var(--bg-active)]'
              : 'hover:bg-[var(--bg-hover)]',
          )}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--bg-hover)]">
            <cmd.icon size={16} className="text-[var(--text-secondary)]" />
          </div>
          <div>
            <div className="text-sm text-[var(--text-primary)]">{cmd.title}</div>
            <div className="text-xs text-[var(--text-tertiary)]">{cmd.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
