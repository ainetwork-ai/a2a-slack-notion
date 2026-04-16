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
import type { Editor } from '@tiptap/core';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { Range } from '@tiptap/core';
import { common, createLowlight } from 'lowlight';
import { BlockHandleExtension } from './block-handle';
import { CalloutExtension } from './callout-extension';
import { ToggleExtension } from './toggle-extension';
import { ColumnsExtension, ColumnCellExtension } from './columns-extension';
import { MentionList } from './mention-list';
import type { MentionItem, MentionListRef } from './mention-list';
import { AgentMentionTrigger } from './agent-mention-handler';
import { SlashCommandExtension } from './slash-command-extension';
import { CommentHighlight } from './extensions/comment-highlight';

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
      const apiUrl =
        process.env['NEXT_PUBLIC_API_URL'] ??
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:3011`
          : 'http://localhost:3011');

      const [usersRes, agentsRes] = await Promise.all([
        fetch(
          `${apiUrl}/api/v1/mentions/suggest?type=user&q=${encodeURIComponent(query)}&workspace_id=${encodeURIComponent(workspaceId)}`,
          { credentials: 'include' },
        ),
        fetch(
          `${apiUrl}/api/v1/mentions/suggest?type=agent&q=${encodeURIComponent(query)}&workspace_id=${encodeURIComponent(workspaceId)}`,
          { credentials: 'include' },
        ),
      ]);

      const users = usersRes.ok ? ((await usersRes.json()) as MentionItem[]) : [];
      const agents = agentsRes.ok ? ((await agentsRes.json()) as MentionItem[]) : [];

      return [...users, ...agents];
    } catch {
      return [];
    }
  },
  200,
);

export interface EditorExtensionOptions {
  workspaceId?: string;
  /** Getter for workspaceId — use this when workspaceId may be empty at editor mount time */
  getWorkspaceId?: () => string;
  pageId?: string;
  onAgentInvoke?: (params: { agentId: string; agentName: string; prompt: string; pageId: string; workspaceId: string }) => void;
  /** Set true when using with Collaboration extension — disables built-in History (Yjs handles it) */
  collaboration?: boolean;
}

export function getEditorExtensions(options: EditorExtensionOptions = {}) {
  const { workspaceId = '', pageId = '', onAgentInvoke, collaboration = false } = options;
  const resolveWorkspaceId = () => options.getWorkspaceId?.() ?? workspaceId;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false, // replaced by CodeBlockLowlight
      link: false, // replaced by standalone Link extension
      underline: false, // replaced by standalone Underline extension
      ...(collaboration ? { undoRedo: false } : {}), // Yjs handles undo/redo in collaborative mode (v3: UndoRedo, not History)
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
      includeChildren: true,
      placeholder: ({ node, editor }) => {
        if (node.type.name === 'heading') {
          return `Heading ${node.attrs['level'] as number}`;
        }
        if (node.type.name === 'paragraph') {
          // First paragraph = only child of doc = doc has 1 child
          if (editor.state?.doc?.childCount === 1) {
            return "Press Enter to continue with an empty page, or pick a template";
          }
        }
        return "Type '/' for commands";
      },
    }),
    Image.configure({
      HTMLAttributes: { class: 'max-w-full rounded-[var(--radius-md)]' },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Mention.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          isAgent: {
            default: false,
            parseHTML: (element) => element.getAttribute('data-is-agent') === 'true',
            renderHTML: (attributes) => ({
              'data-is-agent': attributes.isAgent ? 'true' : 'false',
            }),
          },
        };
      },
    }).configure({
      HTMLAttributes: {
        class: 'bg-[var(--selection)] text-[var(--accent-blue)] rounded px-0.5 cursor-pointer',
      },
      suggestion: {
        char: '@',
        allowSpaces: false,
        items: async ({ query }: { query: string }): Promise<MentionItem[]> => {
          const wsId = resolveWorkspaceId();
          if (!wsId) return [];
          return fetchSuggestions(query, wsId);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        command({ editor, range, props }: { editor: Editor; range: Range; props: any }) {
          const item = props as MentionItem;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'mention', attrs: { id: item.id, label: item.name, isAgent: item.isAgent ?? false } },
              { type: 'text', text: ' ' },
            ])
            .run();
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
    AgentMentionTrigger.configure({
      onInvoke: onAgentInvoke,
      getPageId: () => pageId,
      getWorkspaceId: resolveWorkspaceId,
    }),
    CalloutExtension,
    ToggleExtension,
    ColumnsExtension,
    ColumnCellExtension,
    BlockHandleExtension,
    SlashCommandExtension,
    CommentHighlight,
  ];
}
