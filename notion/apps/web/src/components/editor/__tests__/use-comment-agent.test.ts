import { describe, it, expect } from 'vitest'
import { parseAgentMentions } from '../use-comment-agent'

describe('parseAgentMentions', () => {
  it('@멘션이 없으면 빈 배열을 반환한다', () => {
    expect(parseAgentMentions('이 부분 수정해줘')).toEqual([])
  })

  it('@멘션 이름 목록을 반환한다', () => {
    expect(parseAgentMentions('@글쓰기에이전트 이 문장을 개선해줘')).toEqual(['글쓰기에이전트'])
  })

  it('여러 @멘션을 모두 추출한다', () => {
    expect(parseAgentMentions('@에이전트1 과 @에이전트2 둘 다 봐줘')).toEqual([
      '에이전트1',
      '에이전트2',
    ])
  })

  it('@멘션을 제거한 순수 지시사항을 반환한다', () => {
    const { instruction } = parseAgentMentions.withInstruction('@글쓰기에이전트 이 부분을 개선해줘')
    expect(instruction).toBe('이 부분을 개선해줘')
  })
})
