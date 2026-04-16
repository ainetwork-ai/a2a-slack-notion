import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const AGENT_MENTION_TRIGGER_KEY = new PluginKey('agentMentionTrigger');

function findAgentMentions(node: ProseMirrorNode): Array<{ id: string; pos: number }> {
  const mentions: Array<{ id: string; pos: number }> = [];
  node.forEach((child, offset) => {
    if (child.type.name === 'mention' && child.attrs['id'] && child.attrs['isAgent'] === true) {
      mentions.push({ id: child.attrs['id'] as string, pos: offset });
    }
  });
  return mentions;
}

function extractTextAfterMention(node: ProseMirrorNode, mentionPos: number): string {
  let text = '';
  let afterMention = false;
  node.forEach((child, offset) => {
    if (offset === mentionPos) {
      afterMention = true;
      return;
    }
    if (afterMention && child.isText) {
      text += child.text ?? '';
    }
  });
  return text.trim();
}

export interface AgentMentionTriggerOptions {
  onInvoke?: (params: { agentId: string; prompt: string; pageId: string; workspaceId: string }) => void;
  getPageId?: () => string;
  getWorkspaceId?: () => string;
}

export const AgentMentionTrigger = Extension.create<AgentMentionTriggerOptions>({
  name: 'agentMentionTrigger',

  addOptions() {
    return {
      onInvoke: undefined,
      getPageId: () => '',
      getWorkspaceId: () => '',
    };
  },

  addProseMirrorPlugins() {
    const extensionOptions = this.options;
    // Scoped to editor instance — cleared when editor is destroyed/recreated (SPA navigation safe)
    const triggeredMentions = new Set<string>();

    return [
      new Plugin({
        key: AGENT_MENTION_TRIGGER_KEY,
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'Enter' || event.shiftKey) return false;

            const { state } = view;
            const { $from } = state.selection;
            const currentNode = $from.parent;

            // Find mentions in current block
            const mentions = findAgentMentions(currentNode);
            if (mentions.length === 0) return false;

            // Check each mention — only trigger untriggered ones
            for (const mention of mentions) {
              const mentionKey = `${mention.id}-${$from.before()}`;
              if (triggeredMentions.has(mentionKey)) continue;

              const prompt = extractTextAfterMention(currentNode, mention.pos);
              if (!prompt) continue;

              // Mark as triggered
              triggeredMentions.add(mentionKey);

              // Fire the invocation
              if (extensionOptions.onInvoke) {
                extensionOptions.onInvoke({
                  agentId: mention.id,
                  prompt,
                  pageId: extensionOptions.getPageId?.() ?? '',
                  workspaceId: extensionOptions.getWorkspaceId?.() ?? '',
                });
              }
            }

            // Don't prevent default — let Enter create a new line
            return false;
          },
        },
      }),
    ];
  },
});
