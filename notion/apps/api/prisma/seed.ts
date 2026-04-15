import { prisma } from '../src/lib/prisma.js';

const DEV_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // Hardhat account #0
const DEV_NAME = 'Dev Admin';

// Default page templates seeded into every workspace
const DEFAULT_TEMPLATES = [
  {
    name: 'Meeting Notes',
    description: 'Capture meeting attendees, agenda, and action items',
    icon: '📝',
    category: 'work',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Date: ' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Attendees: ' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Action Items' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Action item 1 — Owner' }] }] }] },
    ],
  },
  {
    name: 'Project Tracker',
    description: 'Track project goals, status, and tasks in one place',
    icon: '🗂️',
    category: 'work',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Tracker' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Description: ' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Status' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '🟡 In Progress' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tasks' }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 1' }] }] }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 2' }] }] }] },
    ],
  },
  {
    name: 'Weekly Agenda',
    description: 'Plan your week day by day',
    icon: '📅',
    category: 'work',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Weekly Agenda' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Monday' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tuesday' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wednesday' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Thursday' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Friday' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
    ],
  },
  {
    name: 'Bug Report',
    description: 'Structured bug report with reproduction steps and severity',
    icon: '🐛',
    category: 'engineering',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Bug Report' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Steps to Reproduce' }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step 1' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Expected Behavior' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Actual Behavior' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Severity' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low' }] },
    ],
  },
  {
    name: 'Reading Notes',
    description: 'Capture key takeaways and quotes from books or articles',
    icon: '📚',
    category: 'personal',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Reading Notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Author: ' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Key Takeaways' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Takeaway 1' }] }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Quotes' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '"Quote here."' }] }] },
    ],
  },
];

async function seed() {
  const user = await prisma.user.upsert({
    where: { walletAddress: DEV_WALLET },
    update: {},
    create: {
      walletAddress: DEV_WALLET,
      name: DEV_NAME,
    },
  });

  console.log(`✓ Dev user ready (${DEV_WALLET})`);

  let workspace;
  const existingMember = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (!existingMember) {
    workspace = await prisma.workspace.create({
      data: {
        name: 'Dev Workspace',
        icon: '🛡️',
        members: {
          create: {
            userId: user.id,
            role: 'admin',
          },
        },
      },
    });
    console.log('✓ Dev workspace created');
  } else {
    workspace = existingMember.workspace;
    console.log('✓ Dev workspace already exists');
  }

  // Seed "Getting Started" onboarding page (skip if already present)
  const existingGettingStarted = await prisma.block.findFirst({
    where: { workspaceId: workspace.id, type: 'page', title: 'Welcome to Your Workspace' },
  });
  if (!existingGettingStarted) {
    await prisma.block.create({
      data: {
        workspaceId: workspace.id,
        type: 'page',
        title: 'Welcome to Your Workspace',
        icon: '👋',
        createdBy: user.id,
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Welcome to Your Workspace' }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This is your personal workspace — a place to capture ideas, manage projects, and collaborate with your team.',
                },
              ],
            },
            {
              type: 'callout',
              attrs: { emoji: '💡' },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Tip: Press / anywhere in the editor to insert blocks like headings, lists, databases, and more.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Things to try' }],
            },
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create your first page using the sidebar + button' }] }],
                },
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Try the /slash command menu inside the editor' }] }],
                },
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add a database block for tracking tasks or projects' }] }],
                },
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use ⌘K to search across all your pages' }] }],
                },
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Star a page with the ☆ button to add it to Favorites' }] }],
                },
              ],
            },
            {
              type: 'horizontalRule',
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Block types available' }],
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Headings (H1, H2, H3)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Paragraphs and rich text (bold, italic, code, links)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet and numbered lists' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'To-do checklists' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Callout blocks for tips and notices' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Code blocks with syntax highlighting' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote blocks' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Databases (table, board, list, calendar, gallery, timeline views)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Math (KaTeX) and diagrams (Mermaid)' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Embeds (YouTube, Figma, and more)' }] }] },
              ],
            },
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: '"The best tool is the one you actually use." — Start simple, and grow from here.' },
                  ],
                },
              ],
            },
          ],
        },
        childrenOrder: [],
      },
    });
    console.log('✓ "Getting Started" onboarding page created');
  } else {
    console.log('· "Getting Started" page already exists');
  }

  // Seed default page templates (skip if already present)
  for (const tmpl of DEFAULT_TEMPLATES) {
    const exists = await prisma.pageTemplate.findFirst({
      where: { workspaceId: workspace.id, name: tmpl.name, category: tmpl.category },
    });
    if (!exists) {
      await prisma.pageTemplate.create({
        data: {
          workspaceId: workspace.id,
          name: tmpl.name,
          description: tmpl.description,
          icon: tmpl.icon,
          category: tmpl.category,
          content: tmpl.content,
          createdBy: user.id,
        },
      });
      console.log(`  ✓ Template "${tmpl.name}" seeded`);
    } else {
      console.log(`  · Template "${tmpl.name}" already exists`);
    }
  }
  console.log('✓ Default page templates ready');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
