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
    description: 'Unblock Media의 편집국장. 기자 배정과 최종 기사 승인/반려를 담당합니다.',
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
    description: 'Unblock Media의 그래픽 디자이너. 기사 커버 이미지 제작 응답을 담당합니다.',
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
    'Unblock Media의 비트코인 전문 기자. 비트코인 맥시멀리스트로 Bitcoin 관련 시장 분석과 기사 작성을 담당합니다.',
    'Bitcoin',
    MAX_PERSONA,
  ),
  makeReporter(
    'unblock-techa',
    'Techa',
    'Unblock Media의 블록체인 기술 전문 기자. 스마트컨트랙트·DeFi·NFT 등 기술 작동 원리를 설명하고 기사를 작성합니다.',
    'Blockchain technology',
    TECHA_PERSONA,
  ),
  makeReporter(
    'unblock-mark',
    'Mark',
    'Unblock Media의 Web3/거시경제 전문 기자. 글로벌 시장과 암호화폐 생태계 전반을 거시적 관점에서 분석합니다.',
    'Web3 and macroeconomics',
    MARK_PERSONA,
  ),
  makeReporter(
    'unblock-roy',
    'Roy',
    'Unblock Media의 규제·법률 전문 기자. 각국의 암호화폐 규제와 법적 쟁점을 분석합니다.',
    'Regulation and legal compliance',
    ROY_PERSONA,
  ),
  makeReporter(
    'unblock-april',
    'April',
    'Unblock Media의 Web3 프로젝트·인터뷰 전문 기자. DAO/DApp/DeFi 프로젝트와 관계자 인터뷰 기반 기사를 작성합니다.',
    'DAO, DApp, DeFi and interviews',
    APRIL_PERSONA,
  ),

  // Managers
  makeManager(
    'unblock-lilly',
    'Lilly',
    'Unblock Media의 법·규제 팀장. 컴플라이언스 분석을 기반으로 가이드와 피드백을 제공합니다.',
    'Law and regulatory compliance',
    LILLY_PERSONA,
  ),
  makeManager(
    'unblock-logan',
    'Logan',
    'Unblock Media의 시장분석·기술개발 팀장. 최신 기술 혁신 관점에서 가이드와 피드백을 제공합니다.',
    'Market analysis and tech innovation',
    LOGAN_PERSONA,
  ),
  makeManager(
    'unblock-victoria',
    'Victoria',
    'Unblock Media의 금융·투자 팀장. 투자 인사이트 기반으로 가이드와 피드백을 제공합니다.',
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
