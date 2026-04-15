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
    name: '시장 조사 리포트',
    description: `${specialty} 관점에서 편집장 지시와 원본 자료를 바탕으로 웹 검색 기반 시장 조사 리포트 작성`,
    tags: ['report', 'research', 'crypto'],
    examples: [
      '이 소스로 리포트 써줘',
      '오늘 공개된 비트코인 ETF 관련 시장 조사해줘',
    ],
  },
  {
    id: 'writing',
    name: '기사 초안 작성',
    description: `${specialty} 관점에서 마켓 리서치와 팀장 가이드를 바탕으로 기사 초안 작성`,
    tags: ['writing', 'article', 'draft'],
    examples: ['이 리서치와 가이드로 기사 초안 작성해줘'],
  },
  {
    id: 'revision',
    name: '기사 수정',
    description: '팀장 피드백을 반영해 기존 기사 분량을 유지하면서 수정',
    tags: ['revision', 'edit'],
    examples: ['이 피드백 반영해서 고쳐줘'],
  },
];

export const managerSkills = (specialty: string): AgentSkill[] => [
  {
    id: 'guide',
    name: '기사 작성 가이드',
    description: `${specialty} 관점에서 기자가 기사를 쓰기 전에 가이드 제공`,
    tags: ['guide', 'direction', 'management'],
    examples: ['이 마켓리서치 기반으로 기자에게 가이드 줘'],
  },
  {
    id: 'feedback',
    name: '기사 피드백',
    description: `${specialty} 관점에서 기자가 쓴 기사에 대해 종합 피드백 제공`,
    tags: ['feedback', 'review', 'edit'],
    examples: ['이 기사에 대해 피드백 줘'],
  },
];

export const editorInChiefSkills: AgentSkill[] = [
  {
    id: 'assignment',
    name: '기자 배정',
    description: '원본 자료를 기반으로 주제에 적합한 기자를 선정하고 업무 할당',
    tags: ['assignment', 'editorial', 'management'],
    examples: ['이 자료에 어울리는 기자에게 할당해줘'],
  },
  {
    id: 'confirm',
    name: '기사 최종 승인/반려',
    description: '수정된 기사의 구성/정확성을 검토하고 승인 또는 반려 결정',
    tags: ['confirm', 'approval', 'editorial'],
    examples: ['이 기사 최종 검토하고 승인 여부 판단해줘'],
  },
];

export const designerSkills: AgentSkill[] = [
  {
    id: 'drawing',
    name: '커버 이미지 제작',
    description: '편집국장의 요청에 따라 기사 커버 이미지 제작 응답 생성',
    tags: ['drawing', 'design', 'cover'],
    examples: ['이 기사에 어울리는 커버 만들어줘'],
  },
];
