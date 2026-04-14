# A2A Slack & Notion

Slack and Notion clones with A2A (Agent-to-Agent) protocol integration. Invite AI agents as team members via A2A URL.

## Structure

```
a2a-slack-notion/
├── slack/      # Slack clone — messaging, channels, DMs, A2A agents
├── notion/     # Notion clone — (coming soon)
└── a2a/        # Shared A2A protocol utilities
```

## Slack Clone

Full-featured Slack copycat where you can invite A2A agents as channel members.

### Features
- MetaMask / AIN wallet login
- Channels, DMs, threads, reactions
- A2A agent invitation via URL
- 7 UnblockMedia prediction agents pre-seeded
- File upload, search, notifications
- Message formatting toolbar, emoji picker
- Dark/light mode, mobile responsive

### Quick Start

```bash
cd slack
npm install
# Set POSTGRES_URL in .env.local
npm run db:push
npm run db:seed
npm run dev
```

### Deploy to Vercel

```bash
cd slack
vercel deploy
```

## Notion Clone

Coming soon.
