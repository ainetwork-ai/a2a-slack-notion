// Collaboration and CollaborationCursor extensions removed (plain Tiptap + REST autosave).
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { common, createLowlight } from 'lowlight';
import { BlockHandleExtension } from './BlockHandle';
import { MentionList } from './MentionList';
import type { MentionItem, MentionListRef } from './MentionList';
import { CalloutExtension } from './CalloutExtension';
import { ColumnsExtension, ColumnCellExtension } from './ColumnsExtension';
import { ToggleExtension } from './ToggleExtension';

const lowlight = createLowlight(common);

// Debounce helper for async suggestion fetches
function debounceAsync<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  delay: number,
): (...args: TArgs) => Promise<TReturn> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs): Promise<TReturn> =>
    new Promise((resolve) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const result = await fn(...args);
        resolve(result);
      }, delay);
    });
}

const fetchSuggestions = debounceAsync(
  async (query: string, workspaceId: string): Promise<MentionItem[]> => {
    try {
      // Same-origin — the Notion API lives at /api/v1/* in this merged Next.js app.
      const apiUrl = '';
      const res = await fetch(
        `${apiUrl}/api/v1/mentions/suggest?type=user&q=${encodeURIComponent(query)}&workspace_id=${encodeURIComponent(workspaceId)}`,
        { credentials: 'include' },
      );
      if (!res.ok) return [];
      return (await res.json()) as MentionItem[];
    } catch {
      return [];
    }
  },
  200,
);

export interface EditorExtensionOptions {
  workspaceId?: string;
  // Lazy accessor used by callers that don't know workspaceId at mount time.
  getWorkspaceId?: () => string | undefined;
  pageId?: string;
  collaboration?: boolean;
  // Loose signature — real handler lives in the page/component that wires
  // up the editor; extensions.ts itself doesn't call it today.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAgentInvoke?: (...args: any[]) => any;
}

export function getEditorExtensions(options: EditorExtensionOptions = {}) {
  const { workspaceId = '' } = options;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false, // replaced by CodeBlockLowlight
      link: false, // replaced by standalone Link extension
      underline: false, // replaced by standalone Underline extension
    }),
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'text-[var(--accent-blue)] underline cursor-pointer' },
    }),
    Underline,
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          const level = node.attrs['level'] as number;
          return `Heading ${level}`;
        }
        return "Type '/' for commands...";
      },
    }),
    Image.configure({
      HTMLAttributes: { class: 'max-w-full rounded-[var(--radius-md)]' },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Mention.configure({
      HTMLAttributes: {
        class: 'bg-[var(--selection)] text-[var(--accent-blue)] rounded px-0.5 cursor-pointer',
      },
      suggestion: {
        char: '@',
        allowSpaces: false,
        items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
          if (!workspaceId) return [];
          return fetchSuggestions(query, workspaceId);
        },
        render: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let component: ReactRenderer<MentionListRef, any> | null = null;
          let popup: HTMLDivElement | null = null;

          function positionPopup(clientRect: (() => DOMRect | null) | null | undefined) {
            const rect = clientRect?.();
            if (rect && popup) {
              popup.style.top = `${rect.bottom + 4}px`;
              popup.style.left = `${rect.left}px`;
            }
          }

          return {
            onStart(props: SuggestionProps<MentionItem>) {
              component = new ReactRenderer(MentionList as never, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                props: props as any,
                editor: props.editor,
              });

              popup = document.createElement('div');
              popup.style.cssText = 'position:fixed;z-index:9999;pointer-events:auto;';
              document.body.appendChild(popup);

              if (component.element) {
                popup.appendChild(component.element);
              }

              positionPopup(props.clientRect);
            },

            onUpdate(props: SuggestionProps<MentionItem>) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              component?.updateProps(props as any);
              positionPopup(props.clientRect);
            },

            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                if (popup) popup.style.display = 'none';
                return true;
              }
              return (component?.ref as MentionListRef | null)?.onKeyDown(props) ?? false;
            },

            onExit() {
              popup?.remove();
              popup = null;
              component?.destroy();
              component = null;
            },
          };
        },
      },
    }),
    BlockHandleExtension,
    CalloutExtension,
    ColumnsExtension,
    ColumnCellExtension,
    ToggleExtension,
  ];
}
