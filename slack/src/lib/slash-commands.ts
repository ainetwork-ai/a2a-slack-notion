export interface SlashCommand {
  name: string;
  description: string;
  usage?: string;
  execute: (args: string, context: { channelId?: string; conversationId?: string }) => Promise<{ response: string; ephemeral?: boolean }>;
}

export const commands: SlashCommand[] = [
  {
    name: '/help',
    description: 'Show available commands',
    execute: async () => ({
      response: `*Available commands:*
/help — Show this list
/agent <name> <question> — Ask an agent directly
/status <message> — Set your status message
/clear — Clear chat view (visual only)
/topic <text> — Set channel topic/description
/invite @user — Invite user to channel
/leave — Leave the current channel
/mute — Toggle mute for this channel
/dm @user <message> — Send a direct message
/me <action> — Express an action (_you do something_)
/pin — Pin the most recent message
/unpin — Unpin the most recently pinned message
/shrug [message] — Append ¯\\_(ツ)_/¯
/tableflip [message] — Append (╯°□°)╯︵ ┻━┻
/unflip [message] — Append ┬─┬ノ( º _ ºノ)
/lenny [message] — Append ( ͡° ͜ʖ ͡°)
/date — Show current date and time
/remind me in <N> minutes/hours to <msg> — Set a server-persisted reminder
/mcp — List available MCP integrations and their commands
Type /<server> <tool> [args] for any enabled MCP integration`,
      ephemeral: true,
    }),
  },
  {
    name: '/agent',
    description: 'Ask an agent a question',
    usage: '/agent <name> <question>',
    execute: async (args, context) => {
      const parts = args.split(' ');
      const agentName = parts[0];
      const question = parts.slice(1).join(' ');
      if (!agentName || !question) {
        return { response: 'Usage: /agent <name> <question>\nExample: /agent Techa What is your BTC prediction?', ephemeral: true };
      }
      return { response: `@${agentName} ${question}` };
    },
  },
  {
    name: '/status',
    description: 'Set your status message',
    usage: '/status <message>',
    execute: async (args) => {
      if (!args.trim()) {
        return { response: 'Usage: /status <message>\nExample: /status Working from home 🏠', ephemeral: true };
      }
      try {
        await fetch('/api/presence', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statusMessage: args.trim() }),
        });
        return { response: `Status set to: ${args.trim()}`, ephemeral: true };
      } catch {
        return { response: 'Failed to set status', ephemeral: true };
      }
    },
  },
  {
    name: '/clear',
    description: 'Clear chat view (visual only)',
    execute: async () => {
      return { response: '🧹 Chat view cleared. (Messages are not deleted, refresh to see them again.)', ephemeral: true };
    },
  },
  {
    name: '/topic',
    description: 'Set channel topic/description',
    usage: '/topic <text>',
    execute: async (args, context) => {
      if (!args.trim()) return { response: 'Usage: /topic <text>', ephemeral: true };
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };
      try {
        const res = await fetch(`/api/channels/${context.channelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: args.trim() }),
        });
        if (!res.ok) return { response: 'Failed to set topic. You may not have permission.', ephemeral: true };
        return { response: `Channel topic set to: ${args.trim()}`, ephemeral: true };
      } catch {
        return { response: 'Failed to set topic.', ephemeral: true };
      }
    },
  },
  {
    name: '/invite',
    description: 'Invite a user to the channel',
    usage: '/invite @username',
    execute: async (args, context) => {
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };
      const name = args.replace('@', '').trim();
      if (!name) return { response: 'Usage: /invite @username', ephemeral: true };
      try {
        const searchRes = await fetch(`/api/users/search?q=${encodeURIComponent(name)}`);
        const users = await searchRes.json();
        if (!users.length) return { response: `User "${name}" not found.`, ephemeral: true };
        const res = await fetch(`/api/channels/${context.channelId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: users[0].id }),
        });
        if (!res.ok) {
          const err = await res.json();
          return { response: err.error || 'Failed to invite user.', ephemeral: true };
        }
        return { response: `Invited ${users[0].displayName} to the channel.`, ephemeral: true };
      } catch {
        return { response: 'Failed to invite user.', ephemeral: true };
      }
    },
  },
  {
    name: '/leave',
    description: 'Leave the current channel',
    execute: async (_, context) => {
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };
      try {
        const res = await fetch(`/api/channels/${context.channelId}/members`, { method: 'DELETE' });
        if (!res.ok) return { response: 'Failed to leave channel.', ephemeral: true };
        window.location.href = '/workspace';
        return { response: 'Left the channel.', ephemeral: true };
      } catch {
        return { response: 'Failed to leave channel.', ephemeral: true };
      }
    },
  },
  {
    name: '/mute',
    description: 'Toggle mute for this channel',
    execute: async (_, context) => {
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };
      const key = 'slack-a2a-muted';
      const muted = JSON.parse(localStorage.getItem(key) || '[]') as string[];
      const idx = muted.indexOf(context.channelId);
      if (idx >= 0) {
        muted.splice(idx, 1);
        localStorage.setItem(key, JSON.stringify(muted));
        return { response: '🔔 Channel unmuted.', ephemeral: true };
      } else {
        muted.push(context.channelId);
        localStorage.setItem(key, JSON.stringify(muted));
        return { response: '🔇 Channel muted. You won\'t see unread badges.', ephemeral: true };
      }
    },
  },
  {
    name: '/dm',
    description: 'Send a direct message',
    usage: '/dm @user message',
    execute: async (args) => {
      const match = args.match(/^@?(\S+)\s+(.+)/);
      if (!match) return { response: 'Usage: /dm @user message', ephemeral: true };
      const [, name, message] = match;
      try {
        const searchRes = await fetch(`/api/users/search?q=${encodeURIComponent(name)}`);
        const users = await searchRes.json();
        if (!users.length) return { response: `User "${name}" not found.`, ephemeral: true };
        const dmRes = await fetch('/api/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: [users[0].id] }),
        });
        const dm = await dmRes.json();
        await fetch(`/api/dm/${dm.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        });
        return { response: `DM sent to ${users[0].displayName}: "${message}"`, ephemeral: true };
      } catch {
        return { response: 'Failed to send DM.', ephemeral: true };
      }
    },
  },
  {
    name: '/me',
    description: 'Express an action',
    usage: '/me <action>',
    execute: async (args) => {
      if (!args.trim()) return { response: 'Usage: /me <action>', ephemeral: true };
      return { response: `_${args.trim()}_` };
    },
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
    name: '/unflip',
    description: 'Append ┬─┬ノ( º _ ºノ)',
    execute: async (args) => ({
      response: `${args} ┬─┬ノ( º _ ºノ)`.trim(),
    }),
  },
  {
    name: '/lenny',
    description: 'Append ( ͡° ͜ʖ ͡°)',
    execute: async (args) => ({
      response: `${args} ( ͡° ͜ʖ ͡°)`.trim(),
    }),
  },
  {
    name: '/date',
    description: 'Show current date and time',
    execute: async () => ({
      response: `📅 ${new Date().toLocaleString()}`,
      ephemeral: true,
    }),
  },
  {
    name: '/pin',
    description: 'Pin the most recent message in this channel',
    usage: '/pin',
    execute: async (_, context) => {
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };
      try {
        const res = await fetch(`/api/channels/${context.channelId}/messages`);
        if (!res.ok) return { response: 'Could not fetch messages.', ephemeral: true };
        const data = await res.json();
        const msgs: Array<{ id: string; content: string; pinnedAt?: string | null }> = data.messages ?? [];
        // Find most recent unpinned message
        const target = [...msgs].reverse().find(m => !m.pinnedAt);
        if (!target) return { response: 'No unpinned messages found.', ephemeral: true };
        const pinRes = await fetch(`/api/messages/${target.id}/pin`, { method: 'POST' });
        if (!pinRes.ok) return { response: 'Failed to pin message.', ephemeral: true };
        const preview = target.content.slice(0, 60) + (target.content.length > 60 ? '…' : '');
        return { response: `📌 Pinned: "${preview}"`, ephemeral: true };
      } catch {
        return { response: 'Failed to pin message.', ephemeral: true };
      }
    },
  },
  {
    name: '/unpin',
    description: 'Unpin the most recently pinned message in this channel',
    usage: '/unpin',
    execute: async (_, context) => {
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };
      try {
        const res = await fetch(`/api/channels/${context.channelId}/messages`);
        if (!res.ok) return { response: 'Could not fetch messages.', ephemeral: true };
        const data = await res.json();
        const msgs: Array<{ id: string; content: string; pinnedAt?: string | null }> = data.messages ?? [];
        // Find most recently pinned message
        const pinned = msgs.filter(m => m.pinnedAt).sort((a, b) =>
          new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime()
        );
        if (!pinned.length) return { response: 'No pinned messages found.', ephemeral: true };
        const target = pinned[0];
        const pinRes = await fetch(`/api/messages/${target.id}/pin`, { method: 'POST' });
        if (!pinRes.ok) return { response: 'Failed to unpin message.', ephemeral: true };
        const preview = target.content.slice(0, 60) + (target.content.length > 60 ? '…' : '');
        return { response: `Unpinned: "${preview}"`, ephemeral: true };
      } catch {
        return { response: 'Failed to unpin message.', ephemeral: true };
      }
    },
  },
  {
    name: '/remind',
    description: 'Set a reminder',
    usage: '/remind me in <N> minutes/hours to <message> | /remind me at <time> to <message>',
    execute: async (args, context) => {
      // Parse: "me in 30 minutes to check the build"
      const relativeMatch = args.match(/^me\s+in\s+(\d+)\s+(minute|minutes|min|hour|hours|hr|hrs)\s+to\s+(.+)/i);
      // Parse: "me at 5pm to review PR" or "me at 17:00 to review PR"
      const absoluteMatch = args.match(/^me\s+at\s+(\d{1,2}(?::\d{2})?(?:am|pm)?)\s+to\s+(.+)/i);
      // Fallback: legacy "<N> <message>"
      const legacyMatch = args.match(/^(\d+)\s+(.+)/);

      let remindAt: Date;
      let message: string;

      if (relativeMatch) {
        const [, amount, unit, msg] = relativeMatch;
        message = msg.trim();
        const ms = parseInt(amount) * (/hour/i.test(unit) ? 3600000 : 60000);
        remindAt = new Date(Date.now() + ms);
      } else if (absoluteMatch) {
        const [, timeStr, msg] = absoluteMatch;
        message = msg.trim();
        const now = new Date();
        // Parse time string
        const timeParsed = timeStr.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i);
        if (!timeParsed) return { response: 'Could not parse time. Try "/remind me at 5pm to review PR"', ephemeral: true };
        let hours = parseInt(timeParsed[1]);
        const mins = timeParsed[2] ? parseInt(timeParsed[2]) : 0;
        const ampm = timeParsed[3]?.toLowerCase();
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        remindAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins, 0, 0);
        if (remindAt <= now) remindAt.setDate(remindAt.getDate() + 1);
      } else if (legacyMatch) {
        const [, minutes, msg] = legacyMatch;
        message = msg.trim();
        remindAt = new Date(Date.now() + parseInt(minutes) * 60000);
      } else {
        return {
          response: 'Usage:\n• /remind me in 30 minutes to check the build\n• /remind me in 2 hours to review PR\n• /remind me at 5pm to standup',
          ephemeral: true,
        };
      }

      try {
        const res = await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            remindAt: remindAt.toISOString(),
            channelId: context.channelId,
          }),
        });
        if (!res.ok) return { response: 'Failed to save reminder.', ephemeral: true };
        const timeLabel = remindAt.toLocaleString();
        return { response: `⏰ Reminder saved for ${timeLabel}: "${message}"`, ephemeral: true };
      } catch {
        return { response: 'Failed to save reminder.', ephemeral: true };
      }
    },
  },
  {
    name: '/mcp',
    description: 'MCP integrations — /mcp <server> <tool> [args]',
    usage: '/mcp [server] [tool] [args]',
    execute: async (args, context) => {
      if (!context.channelId) return { response: 'This command only works in channels.', ephemeral: true };

      const parts = args.trim().split(/\s+/);
      const serverId = parts[0]?.toLowerCase();

      // No args or "list" → show available servers
      if (!serverId || serverId === 'list' || serverId === 'help') {
        try {
          const [serversRes, integrationsRes] = await Promise.all([
            fetch('/api/mcp/servers'),
            fetch(`/api/channels/${context.channelId}/mcp`),
          ]);
          if (!serversRes.ok) return { response: 'Failed to load MCP servers.', ephemeral: true };
          const servers: Array<{ id: string; name: string; icon: string; description: string; tools: Array<{ name: string; description: string }> }> = await serversRes.json();
          const integrations: Array<{ serverId: string; enabled: boolean }> = integrationsRes.ok ? await integrationsRes.json() : [];
          const enabledIds = new Set(integrations.filter(i => i.enabled).map(i => i.serverId));

          if (servers.length === 0) return { response: 'No MCP servers configured.', ephemeral: true };

          const lines = servers.map(s => {
            const status = enabledIds.has(s.id) ? '✅' : '⬜';
            const toolList = s.tools.map(t => `   • /mcp ${s.id} ${t.name} — ${t.description}`).join('\n');
            return `${status} ${s.icon} *${s.name}* (\`${s.id}\`) — ${s.description}\n${toolList}`;
          });

          return {
            response: `*MCP Integrations*\n\n${lines.join('\n\n')}\n\n_Enable/disable in Channel Settings > MCP tab._`,
            ephemeral: true,
          };
        } catch {
          return { response: 'Failed to load MCP integrations.', ephemeral: true };
        }
      }

      // Fetch servers to validate serverId
      let servers: Array<{ id: string; name: string; icon: string; tools: Array<{ name: string; description: string; parameters?: Record<string, { type: string; description: string; required?: boolean }> }> }>;
      try {
        const res = await fetch('/api/mcp/servers');
        if (!res.ok) return { response: 'Failed to load MCP servers.', ephemeral: true };
        servers = await res.json();
      } catch {
        return { response: 'Failed to load MCP servers.', ephemeral: true };
      }

      const server = servers.find(s => s.id === serverId);
      if (!server) {
        const available = servers.map(s => s.id).join(', ');
        return { response: `Unknown server "${serverId}". Available: ${available}`, ephemeral: true };
      }

      const toolName = parts[1]?.toLowerCase();

      // No tool → show server help
      if (!toolName || toolName === 'help') {
        const toolList = server.tools
          .map(t => `• /mcp ${server.id} ${t.name} — ${t.description}`)
          .join('\n');
        return {
          response: `${server.icon} *${server.name} Commands*\n${toolList}`,
          ephemeral: true,
        };
      }

      // Find the tool
      const tool = server.tools.find(t => t.name === toolName);
      if (!tool) {
        const available = server.tools.map(t => t.name).join(', ');
        return { response: `Unknown tool "${toolName}" for ${server.id}. Available: ${available}`, ephemeral: true };
      }

      // Build params from remaining args
      const remainingArgs = parts.slice(2).join(' ');
      const params: Record<string, unknown> = {};
      if (tool.parameters) {
        const paramDefs = Object.entries(tool.parameters);
        const requiredParam = paramDefs.find(([, def]) => def.required);
        if (requiredParam && remainingArgs) {
          params[requiredParam[0]] = remainingArgs;
        } else if (paramDefs.length > 0 && remainingArgs) {
          const firstStringParam = paramDefs.find(([, def]) => def.type === 'string');
          if (firstStringParam) params[firstStringParam[0]] = remainingArgs;
        }
      }

      try {
        const res = await fetch('/api/mcp/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId: server.id,
            toolName,
            params,
            channelId: context.channelId,
          }),
        });
        const result = await res.json();
        if (!res.ok) return { response: result.error || 'Failed to execute command.', ephemeral: true };
        return { response: result.content };
      } catch {
        return { response: `Failed to execute /mcp ${server.id} ${toolName}.`, ephemeral: true };
      }
    },
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

/**
 * Try to match input against custom commands fetched from the API.
 * Returns a synthetic SlashCommand if found, null otherwise.
 */
export async function findCustomCommand(
  input: string,
  workspaceId: string
): Promise<{ command: SlashCommand; args: string } | null> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  // Extract the command name (first word after /)
  const [rawName, ...rest] = trimmed.slice(1).split(' ');
  const name = rawName.toLowerCase();
  if (!name) return null;

  try {
    const res = await fetch(`/api/commands?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return null;
    const cmds: Array<{ id: string; name: string; description: string; responseText: string }> = await res.json();
    const match = cmds.find((c) => c.name === name);
    if (!match) return null;

    const command: SlashCommand = {
      name: `/${match.name}`,
      description: match.description,
      execute: async () => ({ response: match.responseText }),
    };
    return { command, args: rest.join(' ') };
  } catch {
    return null;
  }
}
