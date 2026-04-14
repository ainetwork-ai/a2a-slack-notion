export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string, context: { channelId?: string; conversationId?: string }) => Promise<{ response: string; ephemeral?: boolean }>;
}

export const commands: SlashCommand[] = [
  {
    name: '/help',
    description: 'Show available commands',
    execute: async () => ({
      response: 'Available commands:\n/help — Show this help\n/agent <name> <question> — Ask an agent directly\n/status <message> — Set your status message\n/clear — Clear chat view\n/shrug — ¯\\_(ツ)_/¯',
      ephemeral: true,
    }),
  },
  {
    name: '/shrug',
    description: 'Append ¯\\_(ツ)_/¯',
    execute: async (args) => ({
      response: `${args} ¯\\_(ツ)_/¯`.trim(),
    }),
  },
  {
    name: '/tableflip',
    description: 'Append (╯°□°)╯︵ ┻━┻',
    execute: async (args) => ({
      response: `${args} (╯°□°)╯︵ ┻━┻`.trim(),
    }),
  },
  {
    name: '/lenny',
    description: 'Append ( ͡° ͜ʖ ͡°)',
    execute: async (args) => ({
      response: `${args} ( ͡° ͜ʖ ͡°)`.trim(),
    }),
  },
];

export function findCommand(input: string): { command: SlashCommand; args: string } | null {
  const trimmed = input.trim();
  for (const cmd of commands) {
    if (trimmed === cmd.name || trimmed.startsWith(cmd.name + ' ')) {
      const args = trimmed.slice(cmd.name.length).trim();
      return { command: cmd, args };
    }
  }
  return null;
}
