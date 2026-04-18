import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { RevisionOverlay } from '../revision-overlay'
import type { RevisionState } from '../use-comment-agent'

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

const baseRevision: RevisionState = {
  commentMarkId: 'cm_abc',
  agentId: 'agent-1',
  agentName: '글쓰기에이전트',
  status: 'streaming',
  streamedText: '',
  originalText: '안녕하세요. 저는 Claude입니다.',
}

describe('RevisionOverlay', () => {
  it('스트리밍 중에는 원본 텍스트와 에이전트 이름을 표시한다', () => {
    render(
      <RevisionOverlay
        revision={baseRevision}
        anchorRect={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByText('안녕하세요. 저는 Claude입니다.')).toBeInTheDocument()
    expect(screen.getByText(/글쓰기에이전트/)).toBeInTheDocument()
  })

  it('스트리밍된 텍스트를 실시간으로 표시한다', () => {
    const revision = { ...baseRevision, streamedText: '안녕하세요. 저는 Claude AI입니다.' }
    render(
      <RevisionOverlay
        revision={revision}
        anchorRect={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByText('안녕하세요. 저는 Claude AI입니다.')).toBeInTheDocument()
  })

  it('complete 상태에서 Accept/Reject 버튼이 나타난다', () => {
    const revision = {
      ...baseRevision,
      status: 'complete' as const,
      streamedText: '첨삭된 텍스트입니다.',
    }
    render(
      <RevisionOverlay
        revision={revision}
        anchorRect={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /적용/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /취소/i })).toBeInTheDocument()
  })

  it('Accept 버튼 클릭 시 onAccept를 commentMarkId와 함께 호출한다', () => {
    const onAccept = vi.fn()
    const revision = { ...baseRevision, status: 'complete' as const, streamedText: '첨삭됨' }
    render(
      <RevisionOverlay
        revision={revision}
        anchorRect={null}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /적용/i }))
    expect(onAccept).toHaveBeenCalledWith('cm_abc')
  })

  it('Reject 버튼 클릭 시 onReject를 commentMarkId와 함께 호출한다', () => {
    const onReject = vi.fn()
    const revision = { ...baseRevision, status: 'streaming' as const }
    render(
      <RevisionOverlay
        revision={revision}
        anchorRect={null}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /취소/i }))
    expect(onReject).toHaveBeenCalledWith('cm_abc')
  })
})
