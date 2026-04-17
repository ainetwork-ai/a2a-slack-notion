'use client';

import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Highlighter,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

interface EditorBubbleMenuProps {
  editor: Editor;
}

const TEXT_COLORS = [
  { name: 'Default', value: 'inherit' },
  { name: 'Gray', value: '#787774' },
  { name: 'Brown', value: '#9f6b53' },
  { name: 'Orange', value: '#d9730d' },
  { name: 'Yellow', value: '#cb912f' },
  { name: 'Green', value: '#448361' },
  { name: 'Blue', value: '#337ea9' },
  { name: 'Purple', value: '#9065b0' },
  { name: 'Pink', value: '#c14c8a' },
  { name: 'Red', value: '#d44c47' },
];

const BG_COLORS = [
  { name: 'Default', value: 'transparent' },
  { name: 'Gray', value: '#f1f1ef' },
  { name: 'Brown', value: '#f4eeee' },
  { name: 'Orange', value: '#fbecdd' },
  { name: 'Yellow', value: '#fbf3db' },
  { name: 'Green', value: '#edf3ec' },
  { name: 'Blue', value: '#e7f3f8' },
  { name: 'Purple', value: '#f6f3f9' },
  { name: 'Pink', value: '#faf1f5' },
  { name: 'Red', value: '#fdebec' },
];

function ColorPicker({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 w-[200px] rounded-[var(--radius-md)] bg-[var(--bg-default)] shadow-[var(--shadow-menu)] p-2 z-50"
    >
      {/* Text colors */}
      <div className="mb-2">
        <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide px-1 mb-1">
          Text color
        </p>
        <div className="flex flex-wrap gap-1 px-1">
          {TEXT_COLORS.map((color) => (
            <button
              key={color.name}
              title={color.name}
              onClick={() => {
                if (color.value === 'inherit') {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(color.value).run();
                }
                onClose();
              }}
              className="flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
            >
              <span
                className="w-4 h-4 rounded-full border border-[var(--divider)]"
                style={{
                  backgroundColor: color.value === 'inherit' ? 'var(--text-primary)' : color.value,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--divider)] my-2" />

      {/* Background colors */}
      <div>
        <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide px-1 mb-1">
          Background
        </p>
        <div className="flex flex-wrap gap-1 px-1">
          {BG_COLORS.map((color) => (
            <button
              key={color.name}
              title={`${color.name} background`}
              onClick={() => {
                if (color.value === 'transparent') {
                  editor.chain().focus().unsetHighlight().run();
                } else {
                  editor.chain().focus().toggleHighlight({ color: color.value }).run();
                }
                onClose();
              }}
              className="flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
            >
              <span
                className="w-4 h-4 rounded-full border border-[var(--divider)]"
                style={{
                  backgroundColor: color.value === 'transparent' ? 'var(--bg-default)' : color.value,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const items = [
    {
      icon: Bold,
      title: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold'),
    },
    {
      icon: Italic,
      title: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic'),
    },
    {
      icon: Underline,
      title: 'Underline',
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: () => editor.isActive('underline'),
    },
    {
      icon: Strikethrough,
      title: 'Strikethrough',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive('strike'),
    },
    {
      icon: Code,
      title: 'Code',
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: () => editor.isActive('code'),
    },
    {
      icon: Highlighter,
      title: 'Highlight',
      action: () => editor.chain().focus().toggleHighlight().run(),
      isActive: () => editor.isActive('highlight'),
    },
    {
      icon: Link,
      title: 'Link',
      action: () => {
        const url = window.prompt('URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      },
      isActive: () => editor.isActive('link'),
    },
  ];

  return (
    <BubbleMenu editor={editor}>
      <div className="notion-menu animate-dropdown-in relative flex items-center gap-0.5 p-1">
        {items.map((item) => (
          <button
            key={item.title}
            onClick={item.action}
            className={cn(
              'notion-hover flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]',
              item.isActive()
                ? 'bg-[var(--bg-active)] text-[var(--accent-blue)]'
                : 'text-[var(--text-secondary)]',
            )}
            title={item.title}
          >
            <item.icon size={15} />
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-4 bg-[var(--divider)] mx-0.5" />

        {/* Color picker button */}
        <div className="relative">
          <button
            onClick={() => setColorPickerOpen((prev) => !prev)}
            className={cn(
              'notion-hover flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]',
              colorPickerOpen
                ? 'bg-[var(--bg-active)] text-[var(--accent-blue)]'
                : 'text-[var(--text-secondary)]',
            )}
            title="Colors"
          >
            <Palette size={15} />
          </button>

          {colorPickerOpen && (
            <ColorPicker editor={editor} onClose={() => setColorPickerOpen(false)} />
          )}
        </div>
      </div>
    </BubbleMenu>
  );
}
