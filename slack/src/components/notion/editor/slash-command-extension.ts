import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { SlashCommandList } from './slash-command-list';
import type { SlashCommandListRef } from './slash-command-list';
import { SLASH_COMMANDS, filterCommands, recordRecentlyUsed, MENU_MAX_HEIGHT } from './slash-command-items';
import type { SlashCommandItem } from './slash-command-items';

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }: { query: string }): SlashCommandItem[] => {
          return filterCommands(query, SLASH_COMMANDS);
        },
        command({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          props: any;
        }) {
          const item = props as SlashCommandItem;
          recordRecentlyUsed(item.title);
          item.command(editor, range);
        },
        render: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let component: ReactRenderer<SlashCommandListRef, any> | null = null;
          let popup: HTMLDivElement | null = null;

          function positionPopup(
            clientRect: (() => DOMRect | null) | null | undefined,
          ) {
            const rect = clientRect?.();
            if (rect && popup) {
              const viewportHeight = window.innerHeight;
              const menuHeight = MENU_MAX_HEIGHT;
              const top = rect.bottom + 4;
              const adjustedTop =
                top + menuHeight > viewportHeight ? rect.top - menuHeight - 4 : top;
              popup.style.top = `${adjustedTop}px`;
              popup.style.left = `${rect.left}px`;
            }
          }

          return {
            onStart(props: SuggestionProps<SlashCommandItem>) {
              component = new ReactRenderer(SlashCommandList as never, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                props: { ...props, query: props.query } as any,
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

            onUpdate(props: SuggestionProps<SlashCommandItem>) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              component?.updateProps({ ...props, query: props.query } as any);
              positionPopup(props.clientRect);
            },

            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                return false; // let Suggestion plugin handle via onExit
              }
              return (
                (component?.ref as SlashCommandListRef | null)?.onKeyDown(props) ?? false
              );
            },

            onExit() {
              popup?.remove();
              popup = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
