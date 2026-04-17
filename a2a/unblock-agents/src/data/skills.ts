import type { AgentSkill } from '@a2a-js/sdk';

// ─────────────────────────────────────────────────────────────
// Per-role skill factories. Each returns an array of AgentSkill entries
// that go into the agent's AgentCard.skills. The skill ids are the keys
// callers use in `metadata.skillId` to activate the matching pipeline
// prompt (see ./pipeline-prompts.ts + ./agents.ts skillPrompts mapping).
//
// Standard-required fields (id, name, description, tags) are always set.
// inputModes / outputModes are omitted so the agent-level defaults
// ["text/plain"] apply — adding them would only be needed for per-skill
// overrides (audio, json, etc.).
// ─────────────────────────────────────────────────────────────

export const reporterSkills = (specialty: string): AgentSkill[] => [
  {
    id: 'report',
    name: 'Market Research Report',
    description: `Write a web-search-based market research report from the ${specialty} perspective, following editor-in-chief instructions and source materials`,
    tags: ['report', 'research', 'crypto'],
    examples: [
      'Write a report using this source',
      'Research the Bitcoin ETF announced today',
    ],
  },
  {
    id: 'writing',
    name: 'Article Draft Writing',
    description: `Write an article draft from the ${specialty} perspective, based on market research and team lead guidance`,
    tags: ['writing', 'article', 'draft'],
    examples: ['Write an article draft using this research and guide'],
  },
  {
    id: 'revision',
    name: 'Article Revision',
    description: 'Revise the article incorporating team lead feedback while maintaining the original length',
    tags: ['revision', 'edit'],
    examples: ['Revise incorporating this feedback'],
  },
];

export const managerSkills = (specialty: string): AgentSkill[] => [
  {
    id: 'guide',
    name: 'Article Writing Guide',
    description: `Provide guidance from the ${specialty} perspective before the reporter writes an article`,
    tags: ['guide', 'direction', 'management'],
    examples: ['Give the reporter a guide based on this market research'],
  },
  {
    id: 'feedback',
    name: 'Article Feedback',
    description: `Provide comprehensive feedback on the reporter's article from the ${specialty} perspective`,
    tags: ['feedback', 'review', 'edit'],
    examples: ['Give feedback on this article'],
  },
];

export const editorInChiefSkills: AgentSkill[] = [
  {
    id: 'assignment',
    name: 'Reporter Assignment',
    description: 'Select a reporter suitable for the topic based on source materials and assign the task',
    tags: ['assignment', 'editorial', 'management'],
    examples: ['Assign this to a reporter who fits the material'],
  },
  {
    id: 'confirm',
    name: 'Final Article Approval/Rejection',
    description: 'Review the revised article for structure and accuracy, and decide to approve or reject',
    tags: ['confirm', 'approval', 'editorial'],
    examples: ['Do a final review and decide whether to approve this article'],
  },
];

export const designerSkills: AgentSkill[] = [
  {
    id: 'drawing',
    name: 'Cover Image Creation',
    description: 'Generate an article cover image response per the editor-in-chief request',
    tags: ['drawing', 'design', 'cover'],
    examples: ['Create a cover that fits this article'],
  },
];
