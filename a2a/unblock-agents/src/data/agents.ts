import type { AgentCard, AgentSkill } from '@a2a-js/sdk';

import {
  MAX_PERSONA,
  TECHA_PERSONA,
  MARK_PERSONA,
  ROY_PERSONA,
  APRIL_PERSONA,
  LILLY_PERSONA,
  LOGAN_PERSONA,
  VICTORIA_PERSONA,
  DAMIEN_PERSONA,
  OLIVE_PERSONA,
} from './personas';

import {
  ASSIGNMENT_PROMPT,
  REPORT_PROMPT,
  GUIDE_PROMPT,
  WRITING_PROMPT,
  FEEDBACK_PROMPT,
  REVISION_PROMPT,
  CONFIRM_PROMPT,
  DRAWING_PROMPT,
} from './pipeline-prompts';

import {
  reporterSkills,
  managerSkills,
  editorInChiefSkills,
  designerSkills,
} from './skills';

// ─────────────────────────────────────────────────────────────
// UnblockAgent = one agent definition (persona + skills + per-skill prompt).
// Card URL is left blank here and populated at request time from
// getBaseUrl() so the same codebase works on localhost / ngrok / Vercel
// without code changes.
// ─────────────────────────────────────────────────────────────

export interface UnblockAgent {
  id: string;                       // stable slug, used in URL path
  card: Omit<AgentCard, 'url'> & { url: string }; // url replaced at request time
  persona: string;                  // system prompt foundation
  skillPrompts: Record<string, string>; // skillId → task-specific prompt appended to persona
}

const baseCardDefaults = {
  protocolVersion: '0.3.0',
  version: '0.1.0',
  url: '',                          // filled in at request time
  capabilities: { streaming: true },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
};

function makeReporter(
  id: string,
  displayName: string,
  description: string,
  specialty: string,
  persona: string,
): UnblockAgent {
  const skills: AgentSkill[] = reporterSkills(specialty);
  return {
    id,
    card: {
      ...baseCardDefaults,
      name: displayName,
      description,
      skills,
    },
    persona,
    skillPrompts: {
      report: REPORT_PROMPT,
      writing: WRITING_PROMPT,
      revision: REVISION_PROMPT,
    },
  };
}

function makeManager(
  id: string,
  displayName: string,
  description: string,
  specialty: string,
  persona: string,
): UnblockAgent {
  const skills: AgentSkill[] = managerSkills(specialty);
  return {
    id,
    card: {
      ...baseCardDefaults,
      name: displayName,
      description,
      skills,
    },
    persona,
    skillPrompts: {
      guide: GUIDE_PROMPT,
      feedback: FEEDBACK_PROMPT,
    },
  };
}

const editorInChief: UnblockAgent = {
  id: 'unblock-damien',
  card: {
    ...baseCardDefaults,
    name: 'Damien',
    description: 'Editor-in-chief at Unblock Media. Responsible for reporter assignment and final article approval/rejection.',
    skills: editorInChiefSkills,
  },
  persona: DAMIEN_PERSONA,
  skillPrompts: {
    assignment: ASSIGNMENT_PROMPT,
    confirm: CONFIRM_PROMPT,
  },
};

const designer: UnblockAgent = {
  id: 'unblock-olive',
  card: {
    ...baseCardDefaults,
    name: 'Olive',
    description: 'Graphic designer at Unblock Media. Responsible for creating article cover images.',
    skills: designerSkills,
  },
  persona: OLIVE_PERSONA,
  skillPrompts: {
    drawing: DRAWING_PROMPT,
  },
};

const agents: UnblockAgent[] = [
  // Reporters
  makeReporter(
    'unblock-max',
    'Max',
    'Bitcoin specialist reporter at Unblock Media. A Bitcoin maximalist responsible for Bitcoin market analysis and article writing.',
    'Bitcoin',
    MAX_PERSONA,
  ),
  makeReporter(
    'unblock-techa',
    'Techa',
    'Blockchain technology specialist reporter at Unblock Media. Explains technical workings of smart contracts, DeFi, NFTs, and more, and writes articles.',
    'Blockchain technology',
    TECHA_PERSONA,
  ),
  makeReporter(
    'unblock-mark',
    'Mark',
    'Web3 and macroeconomics specialist reporter at Unblock Media. Analyzes global markets and the broader cryptocurrency ecosystem from a macro perspective.',
    'Web3 and macroeconomics',
    MARK_PERSONA,
  ),
  makeReporter(
    'unblock-roy',
    'Roy',
    'Regulation and legal specialist reporter at Unblock Media. Analyzes cryptocurrency regulations and legal issues across countries.',
    'Regulation and legal compliance',
    ROY_PERSONA,
  ),
  makeReporter(
    'unblock-april',
    'April',
    'Web3 project and interview specialist reporter at Unblock Media. Writes articles based on DAO/DApp/DeFi projects and stakeholder interviews.',
    'DAO, DApp, DeFi and interviews',
    APRIL_PERSONA,
  ),

  // Managers
  makeManager(
    'unblock-lilly',
    'Lilly',
    'Law and regulatory team lead at Unblock Media. Provides guidance and feedback based on compliance analysis.',
    'Law and regulatory compliance',
    LILLY_PERSONA,
  ),
  makeManager(
    'unblock-logan',
    'Logan',
    'Market analysis and tech development team lead at Unblock Media. Provides guidance and feedback from the perspective of latest tech innovation.',
    'Market analysis and tech innovation',
    LOGAN_PERSONA,
  ),
  makeManager(
    'unblock-victoria',
    'Victoria',
    'Finance and investment team lead at Unblock Media. Provides guidance and feedback based on investment insights.',
    'Finance and investment',
    VICTORIA_PERSONA,
  ),

  // Editor-in-chief
  editorInChief,

  // Designer
  designer,
];

export const UNBLOCK_AGENTS: Readonly<Record<string, UnblockAgent>> = Object.freeze(
  Object.fromEntries(agents.map((a) => [a.id, a])),
);

export const UNBLOCK_AGENT_IDS: readonly string[] = agents.map((a) => a.id);
