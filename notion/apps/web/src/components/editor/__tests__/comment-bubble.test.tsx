import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CommentBubble } from '../comment-bubble'

afterEach(cleanup)

const mockPosition = { top: 100, left: 200, selectedText: 'Hello world' }

describe('CommentBubble', () => {
  it('position이 null이면 렌더링하지 않는다', () => {
    const { container } = render(
      <CommentBubble position={null} onSubmit={vi.fn()} onClose={vi.fn()} workspaceId="" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('position이 있으면 + 버튼을 표시한다', () => {
    render(
      <CommentBubble position={mockPosition} onSubmit={vi.fn()} onClose={vi.fn()} workspaceId="" />,
    )
    const buttons = screen.getAllByRole('button', { name: /comment/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('+ 버튼 클릭 시 코멘트 입력창을 열고 선택 텍스트를 표시한다', () => {
    render(
      <CommentBubble position={mockPosition} onSubmit={vi.fn()} onClose={vi.fn()} workspaceId="" />,
    )
    const buttons = screen.getAllByRole('button', { name: /comment/i })
    fireEvent.click(buttons[0]!)
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/코멘트 작성/i)).toBeInTheDocument()
  })

  it('빈 입력으로는 제출할 수 없다', () => {
    const onSubmit = vi.fn()
    render(
      <CommentBubble position={mockPosition} onSubmit={onSubmit} onClose={vi.fn()} workspaceId="" />,
    )
    const buttons = screen.getAllByRole('button', { name: /comment/i })
    fireEvent.click(buttons[0]!)
    fireEvent.click(screen.getByRole('button', { name: /저장/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('코멘트 작성 후 제출하면 onSubmit을 호출한다', () => {
    const onSubmit = vi.fn()
    render(
      <CommentBubble position={mockPosition} onSubmit={onSubmit} onClose={vi.fn()} workspaceId="" />,
    )
    const buttons = screen.getAllByRole('button', { name: /comment/i })
    fireEvent.click(buttons[0]!)
    fireEvent.change(screen.getByPlaceholderText(/코멘트 작성/i), {
      target: { value: '@에이전트 이 부분을 더 간결하게 수정해줘' },
    })
    fireEvent.click(screen.getByRole('button', { name: /저장/i }))
    expect(onSubmit).toHaveBeenCalledWith('@에이전트 이 부분을 더 간결하게 수정해줘')
  })
})
