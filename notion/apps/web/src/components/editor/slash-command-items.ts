import type { Editor } from '@tiptap/core';
import type { Range } from '@tiptap/core';
import type React from 'react';
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  AlertCircle,
  ChevronRight,
  ImageIcon,
  Code,
  Table,
  Globe,
  Sigma,
  GitBranch,
  Columns2,
  Columns3,
} from 'lucide-react';

export const MENU_MAX_HEIGHT = 340;

export interface SlashCommandItem {
  title: string;
  description: string;
  group: 'BASIC BLOCKS' | 'MEDIA' | 'EMBEDS';
  keywords: string[];
  shortcut?: string;
  icon: React.ElementType;
  disabled?: boolean;
  command: (editor: Editor, range: Range) => void;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  // ── BASIC BLOCKS ──────────────────────────────────────────────────────────
  {
    title: 'Text',
    description: 'Plain paragraph block',
    group: 'BASIC BLOCKS',
    keywords: ['paragraph', 'plain', 'text', 'p'],
    icon: Type,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    group: 'BASIC BLOCKS',
    keywords: ['h1', 'heading', 'large', 'title'],
    shortcut: '#',
    icon: Heading1,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    group: 'BASIC BLOCKS',
    keywords: ['h2', 'heading', 'medium', 'subtitle'],
    shortcut: '##',
    icon: Heading2,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    group: 'BASIC BLOCKS',
    keywords: ['h3', 'heading', 'small'],
    shortcut: '###',
    icon: Heading3,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list of items',
    group: 'BASIC BLOCKS',
    keywords: ['ul', 'bullet', 'list', 'unordered', 'dash'],
    shortcut: '-',
    icon: List,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Numbered List',
    description: 'Ordered list of items',
    group: 'BASIC BLOCKS',
    keywords: ['ol', 'ordered', 'numbered', 'list', 'number'],
    shortcut: '1.',
    icon: ListOrdered,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'To-do List',
    description: 'Checklist with checkboxes',
    group: 'BASIC BLOCKS',
    keywords: ['todo', 'checklist', 'task', 'checkbox', 'check'],
    shortcut: '[]',
    icon: CheckSquare,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: 'Quote',
    description: 'Capture a quote or callout',
    group: 'BASIC BLOCKS',
    keywords: ['blockquote', 'quote', 'citation'],
    shortcut: '>',
    icon: Quote,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Divider',
    description: 'Horizontal rule to separate sections',
    group: 'BASIC BLOCKS',
    keywords: ['hr', 'divider', 'separator', 'horizontal', 'rule', 'line'],
    shortcut: '---',
    icon: Minus,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: 'Callout',
    description: 'Highlight important information',
    group: 'BASIC BLOCKS',
    keywords: ['callout', 'alert', 'info', 'note', 'warning'],
    icon: AlertCircle,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'callout',
        attrs: { emoji: '💡' },
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    title: 'Toggle List',
    description: 'Collapsible toggle block',
    group: 'BASIC BLOCKS',
    keywords: ['toggle', 'collapse', 'expand', 'accordion', 'details'],
    icon: ChevronRight,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'toggle',
        attrs: { open: true },
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    title: '2 Columns',
    description: 'Two-column layout',
    group: 'BASIC BLOCKS',
    keywords: ['columns', 'column', '2col', 'layout', 'grid'],
    icon: Columns2,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'columns',
        attrs: { columns: 2 },
        content: [
          { type: 'columnCell', content: [{ type: 'paragraph' }] },
          { type: 'columnCell', content: [{ type: 'paragraph' }] },
        ],
      }).run();
    },
  },
  {
    title: '3 Columns',
    description: 'Three-column layout',
    group: 'BASIC BLOCKS',
    keywords: ['columns', 'column', '3col', 'layout', 'grid'],
    icon: Columns3,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'columns',
        attrs: { columns: 3 },
        content: [
          { type: 'columnCell', content: [{ type: 'paragraph' }] },
          { type: 'columnCell', content: [{ type: 'paragraph' }] },
          { type: 'columnCell', content: [{ type: 'paragraph' }] },
        ],
      }).run();
    },
  },

  // ── MEDIA ─────────────────────────────────────────────────────────────────
  {
    title: 'Image',
    description: 'Upload or embed an image by URL',
    group: 'MEDIA',
    keywords: ['image', 'photo', 'picture', 'img', 'upload'],
    icon: ImageIcon,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt('Image URL');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    title: 'Code',
    description: 'Code block with syntax highlighting',
    group: 'MEDIA',
    keywords: ['code', 'snippet', 'programming', 'syntax'],
    icon: Code,
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Table',
    description: 'Insert a structured table',
    group: 'MEDIA',
    keywords: ['table', 'grid', 'spreadsheet', 'rows', 'columns'],
    icon: Table,
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },

  // ── EMBEDS ────────────────────────────────────────────────────────────────
  {
    title: 'Embed',
    description: 'YouTube, Figma, CodePen, and more',
    group: 'EMBEDS',
    keywords: ['embed', 'youtube', 'figma', 'iframe', 'link', 'video', 'codepen'],
    icon: Globe,
    command: (editor, range) => {
      const url = window.prompt('Embed URL');
      editor.chain().focus().deleteRange(range).run();
      if (url) {
        const safeUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
        editor.chain().focus().insertContent({
          type: 'paragraph',
          content: [{ type: 'text', text: safeUrl }],
        }).run();
      }
    },
  },
  {
    title: 'Math Equation',
    description: 'KaTeX formula block',
    group: 'EMBEDS',
    keywords: ['math', 'equation', 'formula', 'katex', 'latex'],
    icon: Sigma,
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'latex' },
          content: [{ type: 'text', text: 'E = mc^2' }],
        })
        .run();
    },
  },
  {
    title: 'Mermaid Diagram',
    description: 'Code-to-diagram rendering',
    group: 'EMBEDS',
    keywords: ['mermaid', 'diagram', 'flowchart', 'graph', 'chart'],
    icon: GitBranch,
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'graph TD\n  A-->B' }],
        })
        .run();
    },
  },
];

// ── Fuzzy scoring ─────────────────────────────────────────────────────────────

export function fuzzyScore(query: string, item: SlashCommandItem): number {
  const q = query.toLowerCase();
  const title = item.title.toLowerCase();
  const desc = item.description.toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 70;
  if (desc.includes(q) || item.keywords.some((k) => k.includes(q))) return 40;
  return 0;
}

export function filterCommands(
  query: string,
  items: SlashCommandItem[],
): SlashCommandItem[] {
  if (!query) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

// ── Recently-used tracker ─────────────────────────────────────────────────────

const RECENTLY_USED_KEY = 'slash-cmd-recently-used';

export function getRecentlyUsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTLY_USED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function recordRecentlyUsed(title: string): void {
  try {
    const recent = getRecentlyUsed().filter((t) => t !== title);
    recent.unshift(title);
    localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {
    // ignore storage errors
  }
}
