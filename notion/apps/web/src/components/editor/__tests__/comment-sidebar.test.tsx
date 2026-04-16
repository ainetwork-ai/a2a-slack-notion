import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentSidebar } from '../comment-sidebar'

const mockComments = [
  {
    id: 'c1',
    content: { text: '이 부분 수정해줘', selectedText: 'Hello world', commentMarkId: 'cm_abc' },
    author: { name: '홍길동', avatar: null },
    resolved: false,
    createdAt: '2026-04-16T10:00:00Z',
    replies: [],
  },
  {
    id: 'c2',
    content: { text: '완료', selectedText: 'foo', commentMarkId: 'cm_def' },
    author: { name: '김철수', avatar: null },
    resolved: true,
    createdAt: '2026-04-16T11:00:00Z',
    replies: [],
  },
]

describe('CommentSidebar', () => {
  it('미해결 코멘트만 기본으로 표시한다', () => {
    render(
      <CommentSidebar
        comments={mockComments}
        onCommentClick={vi.fn()}
        onResolve={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('이 부분 수정해줘')).toBeInTheDocument()
    expect(screen.queryByText('완료')).not.toBeInTheDocument()
  })

  it('"해결됨 보기" 토글 시 해결된 코멘트도 표시한다', () => {
    const { container } = render(
      <CommentSidebar
        comments={mockComments}
        onCommentClick={vi.fn()}
        onResolve={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const toggleBtn = container.querySelector('button[aria-label="해결됨 보기"]')!
    fireEvent.click(toggleBtn)
    expect(screen.getByText('완료')).toBeInTheDocument()
  })

  it('코멘트 클릭 시 onCommentClick에 commentMarkId를 전달한다', () => {
    const onCommentClick = vi.fn()
    const { container } = render(
      <CommentSidebar
        comments={mockComments}
        onCommentClick={onCommentClick}
        onResolve={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const commentCard = container.querySelector('.cursor-pointer')!
    fireEvent.click(commentCard)
    expect(onCommentClick).toHaveBeenCalledWith('cm_abc')
  })
})
