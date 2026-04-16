# Inline Comment Agent Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에이전트가 실시간으로 작성한 텍스트를 드래그 선택해 코멘트를 달고, 코멘트에서 에이전트를 멘션하면 에이전트가 해당 텍스트를 첨삭하는 과정을 스트리밍으로 실시간 표시한다.

**Architecture:** 
Tiptap CommentHighlight Mark로 선택 텍스트를 Yjs 문서에 앵커링한다. 코멘트 입력창은 기존 Mention 확장을 재사용하는 미니 Tiptap 에디터로 구현한다. 에이전트 멘션 제출 시 `/api/v1/agents/revise` SSE 엔드포인트가 원본 텍스트 + 코멘트 지시사항을 에이전트에 전달하고, 응답을 Revision Overlay에 실시간 스트리밍한다. 사용자가 Accept/Reject를 선택하면 에디터 문서에 최종 반영된다.

**Tech Stack:** Tiptap v3 (custom Mark), Yjs + Hocuspocus, React 19, Hono SSE, Prisma, Zustand v5, Tailwind v4

---

## File Structure

```
notion/apps/web/src/components/editor/
├── extensions/
│   └── comment-highlight.ts        [NEW] CommentHighlight Tiptap Mark
├── comment-bubble.tsx              [NEW] 텍스트 선택 시 나타나는 "+" 버튼 + 코멘트 입력 팝업
├── comment-sidebar.tsx             [NEW] 페이지 전체 코멘트 목록 패널
├── revision-overlay.tsx            [NEW] 에이전트 첨삭 스트리밍 표시 오버레이
├── use-comment-agent.ts            [NEW] 코멘트 → 에이전트 첨삭 흐름 Hook
├── collaborative-editor.tsx        [MODIFY] comment state, revision overlay 통합
└── extensions.ts                   [MODIFY] CommentHighlight 등록

notion/apps/api/src/routes/
└── agents.ts                       [MODIFY] POST /agents/revise 엔드포인트 추가

notion/apps/api/src/lib/a2a/
└── agent-invoker.ts                [MODIFY] invokeRevisionStream() 함수 추가
```

---

## Task 1: CommentHighlight Tiptap Mark Extension

**Files:**
- Create: `notion/apps/web/src/components/editor/extensions/comment-highlight.ts`
- Modify: `notion/apps/web/src/components/editor/extensions.ts`

- [ ] **Step 1: 테스트 파일 생성 및 failing 테스트 작성**

`notion/apps/web/src/components/editor/extensions/__tests__/comment-highlight.test.ts` 생성:

```typescript
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { CommentHighlight } from '../comment-highlight'

function createEditor(content: string) {
  return new Editor({
    extensions: [StarterKit, CommentHighlight],
    content,
  })
}

describe('CommentHighlight mark', () => {
  it('commentId 속성으로 마크를 적용한다', () => {
    const editor = createEditor('<p>Hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setCommentHighlight({ commentId: 'cm_test1', status: 'active' })

    const mark = editor.state.doc.nodeAt(1)?.marks.find(m => m.type.name === 'commentHighlight')
    expect(mark?.attrs.commentId).toBe('cm_test1')
    expect(mark?.attrs.status).toBe('active')
    editor.destroy()
  })

  it('commentId로 마크를 제거한다', () => {
    const editor = createEditor('<p>Hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setCommentHighlight({ commentId: 'cm_test1', status: 'active' })
    editor.commands.removeCommentHighlight('cm_test1')

    const mark = editor.state.doc.nodeAt(1)?.marks.find(m => m.type.name === 'commentHighlight')
    expect(mark).toBeUndefined()
    editor.destroy()
  })

  it('status를 revision-in-progress로 업데이트한다', () => {
    const editor = createEditor('<p>Hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setCommentHighlight({ commentId: 'cm_test1', status: 'active' })
    editor.commands.updateCommentHighlightStatus('cm_test1', 'revision-in-progress')

    const mark = editor.state.doc.nodeAt(1)?.marks.find(m => m.type.name === 'commentHighlight')
    expect(mark?.attrs.status).toBe('revision-in-progress')
    editor.destroy()
  })

  it('commentId로 마크 범위의 텍스트를 반환한다', () => {
    const editor = createEditor('<p>Hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setCommentHighlight({ commentId: 'cm_test1', status: 'active' })

    const range = editor.commands.getCommentHighlightRange('cm_test1')
    expect(range).toEqual({ from: 1, to: 6, text: 'Hello' })
    editor.destroy()
  })
})
```

- [ ] **Step 2: 테스트 실행 - FAIL 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/extensions/__tests__/comment-highlight.test.ts
```
Expected: FAIL - `CommentHighlight` not found

- [ ] **Step 3: CommentHighlight Mark 구현**

`notion/apps/web/src/components/editor/extensions/comment-highlight.ts` 생성:

```typescript
import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentHighlight: {
      setCommentHighlight: (attrs: { commentId: string; status: CommentHighlightStatus }) => ReturnType
      removeCommentHighlight: (commentId: string) => ReturnType
      updateCommentHighlightStatus: (commentId: string, status: CommentHighlightStatus) => ReturnType
      getCommentHighlightRange: (commentId: string) => { from: number; to: number; text: string } | null
    }
  }
}

export type CommentHighlightStatus = 'active' | 'revision-in-progress' | 'resolved'

export const CommentHighlight = Mark.create({
  name: 'commentHighlight',
  spanning: true,
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: ({ commentId }) => ({ 'data-comment-id': commentId }),
      },
      status: {
        default: 'active' as CommentHighlightStatus,
        parseHTML: (el) => el.getAttribute('data-status') ?? 'active',
        renderHTML: ({ status }) => ({ 'data-status': status }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-highlight' }), 0]
  },

  addCommands() {
    return {
      setCommentHighlight:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },

      removeCommentHighlight:
        (commentId) =>
        ({ state, dispatch }) => {
          const { doc, tr } = state
          doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark.type)
              }
            })
          })
          if (dispatch) dispatch(tr)
          return true
        },

      updateCommentHighlightStatus:
        (commentId, status) =>
        ({ state, dispatch }) => {
          const { doc, tr } = state
          doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                tr.addMark(
                  pos,
                  pos + node.nodeSize,
                  mark.type.create({ ...mark.attrs, status }),
                )
              }
            })
          })
          if (dispatch) dispatch(tr)
          return true
        },

      getCommentHighlightRange:
        (commentId) =>
        ({ state }) => {
          const { doc } = state
          let from = -1
          let to = -1
          let text = ''
          doc.descendants((node, pos) => {
            if (!node.isText) return
            node.marks.forEach((mark) => {
              if (mark.type.name === this.name && mark.attrs.commentId === commentId) {
                if (from === -1) from = pos
                to = pos + node.nodeSize
                text += node.text ?? ''
              }
            })
          })
          if (from === -1) return null
          return { from, to, text }
        },
    }
  },
})
```

- [ ] **Step 4: 테스트 실행 - PASS 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/extensions/__tests__/comment-highlight.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: extensions.ts에 CommentHighlight 등록**

`notion/apps/web/src/components/editor/extensions.ts` 파일에서 extensions 배열에 추가:

```typescript
// 파일 상단 import에 추가
import { CommentHighlight } from './extensions/comment-highlight'

// getExtensions() 반환 배열에 추가 (Mention 다음에)
CommentHighlight,
```

- [ ] **Step 6: CSS 스타일 추가**

`notion/apps/web/src/app/globals.css` (또는 에디터 전역 스타일 파일)에 추가:

```css
.comment-highlight[data-status='active'] {
  background-color: rgb(253 224 71 / 0.4); /* yellow-300/40 */
  border-bottom: 2px solid rgb(234 179 8); /* yellow-500 */
  cursor: pointer;
}

.comment-highlight[data-status='revision-in-progress'] {
  background-color: rgb(147 197 253 / 0.4); /* blue-300/40 */
  border-bottom: 2px dashed rgb(59 130 246); /* blue-500 */
  animation: pulse-highlight 1.5s ease-in-out infinite;
}

.comment-highlight[data-status='resolved'] {
  background-color: transparent;
  border-bottom: none;
}

@keyframes pulse-highlight {
  0%, 100% { background-color: rgb(147 197 253 / 0.4); }
  50% { background-color: rgb(147 197 253 / 0.7); }
}
```

- [ ] **Step 7: 커밋**

```bash
git add notion/apps/web/src/components/editor/extensions/comment-highlight.ts \
        notion/apps/web/src/components/editor/extensions/__tests__/comment-highlight.test.ts \
        notion/apps/web/src/components/editor/extensions.ts \
        notion/apps/web/src/app/globals.css
git commit -m "feat(editor): add CommentHighlight Tiptap mark for text-range anchoring"
```

---

## Task 2: Comment Bubble — 텍스트 선택 시 플로팅 버튼 + 코멘트 입력창

**Files:**
- Create: `notion/apps/web/src/components/editor/comment-bubble.tsx`
- Modify: `notion/apps/web/src/components/editor/collaborative-editor.tsx`

- [ ] **Step 1: 테스트 파일 작성**

`notion/apps/web/src/components/editor/__tests__/comment-bubble.test.tsx` 생성:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentBubble } from '../comment-bubble'

const mockPosition = { top: 100, left: 200, selectedText: 'Hello world' }

describe('CommentBubble', () => {
  it('position이 null이면 렌더링하지 않는다', () => {
    const { container } = render(
      <CommentBubble position={null} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('position이 있으면 + 버튼을 표시한다', () => {
    render(
      <CommentBubble position={mockPosition} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /comment/i })).toBeInTheDocument()
  })

  it('+ 버튼 클릭 시 코멘트 입력창을 열고 선택 텍스트를 표시한다', () => {
    render(
      <CommentBubble position={mockPosition} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    expect(screen.getByText('"Hello world"')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/코멘트 작성/i)).toBeInTheDocument()
  })

  it('빈 입력으로는 제출할 수 없다', () => {
    const onSubmit = vi.fn()
    render(
      <CommentBubble position={mockPosition} onSubmit={onSubmit} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    fireEvent.click(screen.getByRole('button', { name: /저장/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('코멘트 작성 후 제출하면 onSubmit을 호출한다', () => {
    const onSubmit = vi.fn()
    render(
      <CommentBubble position={mockPosition} onSubmit={onSubmit} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /comment/i }))
    fireEvent.change(screen.getByPlaceholderText(/코멘트 작성/i), {
      target: { value: '@에이전트 이 부분을 더 간결하게 수정해줘' },
    })
    fireEvent.click(screen.getByRole('button', { name: /저장/i }))
    expect(onSubmit).toHaveBeenCalledWith('@에이전트 이 부분을 더 간결하게 수정해줘')
  })
})
```

- [ ] **Step 2: 테스트 실행 - FAIL 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/comment-bubble.test.tsx
```
Expected: FAIL - `CommentBubble` not found

- [ ] **Step 3: CommentBubble 컴포넌트 구현**

`notion/apps/web/src/components/editor/comment-bubble.tsx` 생성:

```typescript
'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquarePlus, X, Send } from 'lucide-react'

export interface CommentBubblePosition {
  top: number
  left: number
  selectedText: string
}

interface CommentBubbleProps {
  position: CommentBubblePosition | null
  onSubmit: (content: string) => void
  onClose: () => void
}

export function CommentBubble({ position, onSubmit, onClose }: CommentBubbleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // position이 바뀌면 (새 선택) 입력 초기화
    setIsOpen(false)
    setContent('')
  }, [position])

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  if (!position) return null

  const handleSubmit = () => {
    const trimmed = content.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setContent('')
    setIsOpen(false)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
      onClose()
    }
  }

  return (
    <div
      className="absolute z-50 flex flex-col items-end gap-2"
      style={{ top: position.top, left: position.left }}
    >
      {/* + 버튼 */}
      {!isOpen && (
        <button
          aria-label="comment"
          onClick={() => setIsOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 shadow-md hover:bg-yellow-500 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4 text-white" />
        </button>
      )}

      {/* 코멘트 입력 팝업 */}
      {isOpen && (
        <div className="w-72 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {/* 선택된 텍스트 미리보기 */}
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="truncate text-xs text-zinc-400 italic">
              &quot;{position.selectedText.slice(0, 60)}{position.selectedText.length > 60 ? '…' : ''}&quot;
            </p>
          </div>

          {/* 입력 영역 */}
          <div className="p-3">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="코멘트 작성 (에이전트 멘션: @이름)"
              rows={3}
              className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center justify-between px-3 pb-3">
            <button
              onClick={() => { setIsOpen(false); onClose() }}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
            >
              <X className="h-3 w-3" /> 취소
            </button>
            <button
              aria-label="저장"
              onClick={handleSubmit}
              disabled={!content.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-40"
            >
              <Send className="h-3 w-3" /> 저장
            </button>
          </div>

          <p className="pb-2 text-center text-[10px] text-zinc-300">⌘↵ 저장 · Esc 취소</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 실행 - PASS 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/comment-bubble.test.tsx
```
Expected: 5 tests PASS

- [ ] **Step 5: collaborative-editor.tsx에 선택 감지 + CommentBubble 통합**

`notion/apps/web/src/components/editor/collaborative-editor.tsx` 에서 에디터 렌더 섹션에 추가:

```typescript
// 상단 import 추가
import { CommentBubble, type CommentBubblePosition } from './comment-bubble'
import { nanoid } from 'nanoid'  // 이미 있으면 재사용

// state 추가 (기존 state 선언 근처)
const [bubblePosition, setBubblePosition] = useState<CommentBubblePosition | null>(null)
const editorContainerRef = useRef<HTMLDivElement>(null)

// 텍스트 선택 감지 - editor onSelectionUpdate에서 호출
const handleSelectionUpdate = useCallback(({ editor }: { editor: Editor }) => {
  const { from, to } = editor.state.selection
  if (from === to) {
    setBubblePosition(null)
    return
  }
  const selectedText = editor.state.doc.textBetween(from, to, ' ')
  if (!selectedText.trim()) {
    setBubblePosition(null)
    return
  }

  // 선택 범위의 끝 좌표 계산 (에디터 DOM 기준)
  const coords = editor.view.coordsAtPos(to)
  const container = editorContainerRef.current?.getBoundingClientRect()
  if (!container) return

  setBubblePosition({
    top: coords.top - container.top - 8,
    left: coords.left - container.left + 16,
    selectedText,
  })
}, [])

// 코멘트 제출 핸들러
const handleCommentSubmit = useCallback(async (content: string) => {
  const editor = editorRef.current
  if (!editor) return
  const { from, to } = editor.state.selection
  const selectedText = editor.state.doc.textBetween(from, to, ' ')
  const commentMarkId = `cm_${nanoid(8)}`

  // 선택 텍스트에 CommentHighlight 마크 적용
  editor.commands.setTextSelection({ from, to })
  editor.commands.setCommentHighlight({ commentId: commentMarkId, status: 'active' })
  editor.commands.setTextSelection(to) // 선택 해제

  // DB에 코멘트 저장
  await fetch(`/api/v1/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockId: pageId,
      content: {
        text: content,
        selectedText,
        commentMarkId,
      },
    }),
  })

  setBubblePosition(null)

  // 코멘트에 에이전트 멘션이 있으면 즉시 첨삭 시작
  const mentionMatch = content.match(/@(\S+)/)
  if (mentionMatch) {
    // Task 6에서 구현할 handleRevisionInvoke 호출
    // handleRevisionInvoke({ commentMarkId, content, selectedText })
  }
}, [pageId])
```

에디터 JSX에서:
```tsx
// <EditorContent> 래퍼를 ref 달린 div로 감싸고,
// onSelectionUpdate를 editor prop에 추가
<div ref={editorContainerRef} className="relative">
  <EditorContent editor={editor} />
  <CommentBubble
    position={bubblePosition}
    onSubmit={handleCommentSubmit}
    onClose={() => setBubblePosition(null)}
  />
</div>
```

에디터 생성 시 `onSelectionUpdate` 옵션 추가 (useEditor 옵션 객체):
```typescript
onSelectionUpdate: handleSelectionUpdate,
```

- [ ] **Step 6: 커밋**

```bash
git add notion/apps/web/src/components/editor/comment-bubble.tsx \
        notion/apps/web/src/components/editor/__tests__/comment-bubble.test.tsx \
        notion/apps/web/src/components/editor/collaborative-editor.tsx
git commit -m "feat(editor): add CommentBubble — text selection triggers floating comment input"
```

---

## Task 3: Comment Sidebar — 코멘트 목록 패널

**Files:**
- Create: `notion/apps/web/src/components/editor/comment-sidebar.tsx`

이 컴포넌트는 페이지 오른쪽에 위치하며 해당 페이지의 모든 코멘트를 보여준다. 코멘트 클릭 시 에디터에서 해당 마크로 스크롤한다.

- [ ] **Step 1: 테스트 작성**

`notion/apps/web/src/components/editor/__tests__/comment-sidebar.test.tsx` 생성:

```typescript
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
    render(
      <CommentSidebar
        comments={mockComments}
        onCommentClick={vi.fn()}
        onResolve={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /해결됨/i }))
    expect(screen.getByText('완료')).toBeInTheDocument()
  })

  it('코멘트 클릭 시 onCommentClick에 commentMarkId를 전달한다', () => {
    const onCommentClick = vi.fn()
    render(
      <CommentSidebar
        comments={mockComments}
        onCommentClick={onCommentClick}
        onResolve={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('이 부분 수정해줘'))
    expect(onCommentClick).toHaveBeenCalledWith('cm_abc')
  })
})
```

- [ ] **Step 2: 테스트 실행 - FAIL 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/comment-sidebar.test.tsx
```
Expected: FAIL

- [ ] **Step 3: CommentSidebar 구현**

`notion/apps/web/src/components/editor/comment-sidebar.tsx` 생성:

```typescript
'use client'

import { useState } from 'react'
import { CheckCircle, Circle, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

interface CommentContent {
  text: string
  selectedText: string
  commentMarkId: string
}

interface CommentItem {
  id: string
  content: CommentContent
  author: { name: string; avatar: string | null }
  resolved: boolean
  createdAt: string
  replies: CommentItem[]
}

interface CommentSidebarProps {
  comments: CommentItem[]
  onCommentClick: (commentMarkId: string) => void
  onResolve: (commentId: string) => void
  onDelete: (commentId: string) => void
}

export function CommentSidebar({ comments, onCommentClick, onResolve, onDelete }: CommentSidebarProps) {
  const [showResolved, setShowResolved] = useState(false)

  const visible = showResolved ? comments : comments.filter((c) => !c.resolved)
  const resolvedCount = comments.filter((c) => c.resolved).length

  return (
    <aside className="flex w-72 flex-col gap-3 border-l border-zinc-100 px-4 py-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          코멘트 {comments.length > 0 && `(${comments.length - resolvedCount})`}
        </h3>
        {resolvedCount > 0 && (
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs text-zinc-400 hover:text-zinc-600"
            aria-label={showResolved ? '해결됨 숨기기' : '해결됨 보기'}
          >
            {showResolved ? '해결됨 숨기기' : `해결됨 보기 (${resolvedCount})`}
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="text-center text-xs text-zinc-300 py-8">코멘트가 없습니다</p>
      )}

      {visible.map((comment) => (
        <div
          key={comment.id}
          onClick={() => onCommentClick(comment.content.commentMarkId)}
          className={[
            'cursor-pointer rounded-xl border p-3 transition-colors hover:border-yellow-300',
            comment.resolved
              ? 'border-zinc-100 opacity-50 dark:border-zinc-800'
              : 'border-zinc-200 dark:border-zinc-700',
          ].join(' ')}
        >
          {/* 선택된 텍스트 인용 */}
          <p className="mb-2 truncate rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-400 italic dark:bg-zinc-800">
            &quot;{comment.content.selectedText.slice(0, 50)}&quot;
          </p>

          {/* 코멘트 본문 */}
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{comment.content.text}</p>

          {/* 메타 + 액션 */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">
              {comment.author.name} ·{' '}
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
            </span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onResolve(comment.id)}
                className="p-1 text-zinc-300 hover:text-green-500"
                title={comment.resolved ? '재열기' : '해결됨으로 표시'}
              >
                {comment.resolved ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => onDelete(comment.id)}
                className="p-1 text-zinc-300 hover:text-red-500"
                title="삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </aside>
  )
}
```

- [ ] **Step 4: 테스트 실행 - PASS 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/comment-sidebar.test.tsx
```
Expected: 3 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add notion/apps/web/src/components/editor/comment-sidebar.tsx \
        notion/apps/web/src/components/editor/__tests__/comment-sidebar.test.tsx
git commit -m "feat(editor): add CommentSidebar — threaded comment list with resolve/delete"
```

---

## Task 4: 백엔드 — 에이전트 첨삭 (Revision) SSE 엔드포인트

**Files:**
- Modify: `notion/apps/api/src/lib/a2a/agent-invoker.ts`
- Modify: `notion/apps/api/src/routes/agents.ts`

현재 `/agents/invoke`는 프롬프트를 에이전트에게 그대로 전달한다. `/agents/revise`는 "원본 텍스트 + 코멘트 지시사항"을 구조화된 프롬프트로 변환해서 에이전트에게 전달한다.

- [ ] **Step 1: agent-invoker.ts에 invokeRevisionStream 추가**

`notion/apps/api/src/lib/a2a/agent-invoker.ts` 파일을 읽고, 기존 `invokeAgentStream` 함수 바로 아래에 다음 함수를 추가:

```typescript
export async function* invokeRevisionStream(
  agentId: string,
  params: {
    originalText: string
    instruction: string
    pageId: string
    workspaceId: string
    commentId: string
  },
  prisma: PrismaClient,
): AsyncGenerator<AgentStreamChunk> {
  const agent = await prisma.user.findFirst({
    where: { id: agentId, isAgent: true },
  })
  if (!agent?.a2aUrl) {
    throw new Error(`Agent ${agentId} not found or has no A2A URL`)
  }

  // 첨삭용 구조화 프롬프트
  const revisionPrompt = [
    `다음 텍스트를 아래 지시사항에 따라 첨삭해주세요.`,
    ``,
    `[원본 텍스트]`,
    params.originalText,
    ``,
    `[첨삭 지시사항]`,
    params.instruction,
    ``,
    `[규칙]`,
    `- 첨삭된 텍스트만 출력하세요. 설명이나 부가 문구는 포함하지 마세요.`,
    `- 원본 텍스트의 형식(줄바꿈 등)을 최대한 유지하세요.`,
  ].join('\n')

  yield { type: 'revision_start', content: JSON.stringify({ agentId, commentId: params.commentId }) }

  yield* streamA2AMessage(agent.a2aUrl, revisionPrompt)

  yield { type: 'revision_end', content: JSON.stringify({ agentId, commentId: params.commentId }) }
}
```

- [ ] **Step 2: agents.ts에 /revise 라우트 추가**

`notion/apps/api/src/routes/agents.ts` 파일에서 기존 `/invoke` 라우트 바로 아래에 추가:

```typescript
// POST /api/v1/agents/revise - 텍스트 첨삭 (SSE 스트리밍)
agents.post('/revise', async (c) => {
  const body = await c.req.json()
  const { agentId, originalText, instruction, pageId, workspaceId, commentId } = body

  if (!agentId || !originalText || !instruction || !pageId || !workspaceId || !commentId) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  return streamSSE(c, async (stream) => {
    try {
      for await (const chunk of invokeRevisionStream(
        agentId,
        { originalText, instruction, pageId, workspaceId, commentId },
        prisma,
      )) {
        await stream.writeSSE({ data: JSON.stringify(chunk) })
      }
      await stream.writeSSE({ data: '[DONE]' })
    } catch (error) {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', content: (error as Error).message }),
      })
    }
  })
})
```

- [ ] **Step 3: API 수동 테스트**

서버가 실행 중이면 다음으로 확인:
```bash
curl -X POST http://localhost:3011/api/v1/agents/revise \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "agentId": "<실제 에이전트 ID>",
    "originalText": "안녕하세요. 저는 Claude입니다.",
    "instruction": "더 격식체로 수정해줘",
    "pageId": "test-page",
    "workspaceId": "test-workspace",
    "commentId": "cm_test1"
  }'
```
Expected: SSE 스트림으로 `revision_start`, `text` chunks, `revision_end` 이벤트 수신

- [ ] **Step 4: 필드 누락 시 400 반환 테스트**

```bash
curl -X POST http://localhost:3011/api/v1/agents/revise \
  -H "Content-Type: application/json" \
  -d '{"agentId": "only-agent"}'
```
Expected: `{"error":"Missing required fields"}` with status 400

- [ ] **Step 5: 커밋**

```bash
git add notion/apps/api/src/lib/a2a/agent-invoker.ts \
        notion/apps/api/src/routes/agents.ts
git commit -m "feat(api): add /agents/revise SSE endpoint for structured text revision"
```

---

## Task 5: use-comment-agent Hook — 코멘트 → 에이전트 첨삭 흐름

**Files:**
- Create: `notion/apps/web/src/components/editor/use-comment-agent.ts`

코멘트 텍스트에서 @멘션된 에이전트를 파싱하고, `/agents/revise` SSE를 소비해 revision 상태를 관리하는 Hook.

- [ ] **Step 1: 테스트 작성**

`notion/apps/web/src/components/editor/__tests__/use-comment-agent.test.ts` 생성:

```typescript
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
```

- [ ] **Step 2: 테스트 실행 - FAIL 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/use-comment-agent.test.ts
```
Expected: FAIL

- [ ] **Step 3: use-comment-agent.ts 구현**

`notion/apps/web/src/components/editor/use-comment-agent.ts` 생성:

```typescript
import { useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'

export interface RevisionState {
  commentMarkId: string
  agentId: string
  agentName: string
  status: 'streaming' | 'complete' | 'accepted' | 'rejected'
  streamedText: string
  originalText: string
}

// @멘션 파싱 (이름 기반, 나중에 ID 매핑)
export function parseAgentMentions(text: string): string[] {
  const matches = text.matchAll(/@(\S+)/g)
  return [...matches].map((m) => m[1])
}

parseAgentMentions.withInstruction = (text: string) => {
  const mentions = parseAgentMentions(text)
  const instruction = text.replace(/@\S+\s*/g, '').trim()
  return { mentions, instruction }
}

interface UseCommentAgentOptions {
  workspaceId: string
  pageId: string
  editorRef: React.MutableRefObject<Editor | null>
  // 에이전트 이름 → ID 조회 함수 (워크스페이스 에이전트 목록에서)
  resolveAgentId: (name: string) => string | undefined
}

export function useCommentAgent({
  workspaceId,
  pageId,
  editorRef,
  resolveAgentId,
}: UseCommentAgentOptions) {
  const [revisions, setRevisions] = useState<Map<string, RevisionState>>(new Map())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())

  const startRevision = useCallback(
    async (params: {
      commentMarkId: string
      commentText: string
      selectedText: string
    }) => {
      const { mentions, instruction } = parseAgentMentions.withInstruction(params.commentText)
      if (mentions.length === 0) return

      const agentName = mentions[0]
      const agentId = resolveAgentId(agentName)
      if (!agentId) {
        console.warn(`Agent not found: ${agentName}`)
        return
      }

      const editor = editorRef.current
      if (!editor) return

      // 하이라이트 상태를 "첨삭 중"으로 변경
      editor.commands.updateCommentHighlightStatus(params.commentMarkId, 'revision-in-progress')

      // Revision 상태 초기화
      setRevisions((prev) => {
        const next = new Map(prev)
        next.set(params.commentMarkId, {
          commentMarkId: params.commentMarkId,
          agentId,
          agentName,
          status: 'streaming',
          streamedText: '',
          originalText: params.selectedText,
        })
        return next
      })

      // SSE 스트림 시작
      const controller = new AbortController()
      abortControllers.current.set(params.commentMarkId, controller)

      try {
        const response = await fetch('/api/v1/agents/revise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId,
            originalText: params.selectedText,
            instruction,
            pageId,
            workspaceId,
            commentId: params.commentMarkId,
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) throw new Error('Revision stream failed')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') break

            const chunk = JSON.parse(raw) as { type: string; content: string }
            if (chunk.type === 'text' && chunk.content) {
              setRevisions((prev) => {
                const next = new Map(prev)
                const current = next.get(params.commentMarkId)
                if (current) {
                  next.set(params.commentMarkId, {
                    ...current,
                    streamedText: current.streamedText + chunk.content,
                  })
                }
                return next
              })
            }
          }
        }

        // 스트리밍 완료
        setRevisions((prev) => {
          const next = new Map(prev)
          const current = next.get(params.commentMarkId)
          if (current) next.set(params.commentMarkId, { ...current, status: 'complete' })
          return next
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Revision stream error:', err)
          setRevisions((prev) => {
            const next = new Map(prev)
            next.delete(params.commentMarkId)
            return next
          })
          editor.commands.updateCommentHighlightStatus(params.commentMarkId, 'active')
        }
      }
    },
    [workspaceId, pageId, editorRef, resolveAgentId],
  )

  const acceptRevision = useCallback(
    (commentMarkId: string) => {
      const editor = editorRef.current
      const revision = revisions.get(commentMarkId)
      if (!editor || !revision) return

      const range = editor.commands.getCommentHighlightRange(commentMarkId)
      if (range) {
        // 원본 텍스트를 첨삭 텍스트로 교체
        editor
          .chain()
          .setTextSelection({ from: range.from, to: range.to })
          .deleteSelection()
          .insertContent(revision.streamedText)
          .run()
      }

      // 마크 제거
      editor.commands.removeCommentHighlight(commentMarkId)

      setRevisions((prev) => {
        const next = new Map(prev)
        next.delete(commentMarkId)
        return next
      })
    },
    [editorRef, revisions],
  )

  const rejectRevision = useCallback(
    (commentMarkId: string) => {
      const editor = editorRef.current
      if (!editor) return

      // AbortController로 진행 중인 스트림 취소
      abortControllers.current.get(commentMarkId)?.abort()
      abortControllers.current.delete(commentMarkId)

      // 하이라이트를 active로 복원
      editor.commands.updateCommentHighlightStatus(commentMarkId, 'active')

      setRevisions((prev) => {
        const next = new Map(prev)
        next.delete(commentMarkId)
        return next
      })
    },
    [editorRef],
  )

  return { revisions, startRevision, acceptRevision, rejectRevision }
}
```

- [ ] **Step 4: 테스트 실행 - PASS 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/use-comment-agent.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add notion/apps/web/src/components/editor/use-comment-agent.ts \
        notion/apps/web/src/components/editor/__tests__/use-comment-agent.test.ts
git commit -m "feat(editor): add useCommentAgent hook — parse @mentions and stream revision state"
```

---

## Task 6: RevisionOverlay — 실시간 첨삭 과정 표시 (핵심)

**Files:**
- Create: `notion/apps/web/src/components/editor/revision-overlay.tsx`

에디터 내 `CommentHighlight` 마크 위치 바로 아래에 고정(absolute)되어 나타나는 첨삭 과정 카드. 원본 텍스트(흐리게)와 에이전트가 실시간으로 타이핑하는 첨삭 텍스트를 나란히 보여준다.

- [ ] **Step 1: 테스트 작성**

`notion/apps/web/src/components/editor/__tests__/revision-overlay.test.tsx` 생성:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RevisionOverlay } from '../revision-overlay'
import type { RevisionState } from '../use-comment-agent'

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
```

- [ ] **Step 2: 테스트 실행 - FAIL 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/revision-overlay.test.tsx
```
Expected: FAIL

- [ ] **Step 3: RevisionOverlay 구현**

`notion/apps/web/src/components/editor/revision-overlay.tsx` 생성:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import type { RevisionState } from './use-comment-agent'

interface RevisionOverlayProps {
  revision: RevisionState
  anchorRect: DOMRect | null  // 하이라이트된 텍스트의 DOM 위치 (null이면 상단 고정)
  onAccept: (commentMarkId: string) => void
  onReject: (commentMarkId: string) => void
}

export function RevisionOverlay({ revision, anchorRect, onAccept, onReject }: RevisionOverlayProps) {
  const streamedEndRef = useRef<HTMLDivElement>(null)

  // 스트리밍 텍스트가 추가될 때 자동 스크롤
  useEffect(() => {
    streamedEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [revision.streamedText])

  const isStreaming = revision.status === 'streaming'
  const isComplete = revision.status === 'complete'

  // anchorRect가 있으면 텍스트 아래에, 없으면 에디터 내 고정 위치
  const style = anchorRect
    ? {
        position: 'fixed' as const,
        top: anchorRect.bottom + 8,
        left: anchorRect.left,
        width: Math.max(anchorRect.width, 320),
        zIndex: 50,
      }
    : { position: 'relative' as const }

  return (
    <div
      style={style}
      className="max-w-md overflow-hidden rounded-xl border border-blue-200 bg-white shadow-xl dark:border-blue-800 dark:bg-zinc-900"
    >
      {/* 헤더: 에이전트 상태 표시 */}
      <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 dark:border-blue-900 dark:bg-blue-950">
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
        ) : (
          <Check className="h-3.5 w-3.5 text-green-500" />
        )}
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
          {revision.agentName}
          {isStreaming ? ' 첨삭 중...' : ' 첨삭 완료'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* 원본 텍스트 */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            원본
          </p>
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500">
            {revision.originalText}
          </p>
        </div>

        {/* 화살표 구분선 */}
        <div className="flex items-center gap-2 text-zinc-300">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs">↓</span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* 첨삭 텍스트 (실시간 스트리밍) */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-500">
            첨삭
          </p>
          <div className="min-h-[2.5rem] rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-zinc-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-zinc-100">
            {revision.streamedText || (
              <span className="text-zinc-300">
                {isStreaming && <span className="animate-pulse">|</span>}
              </span>
            )}
            {isStreaming && revision.streamedText && (
              <span className="inline-block h-4 w-0.5 animate-pulse bg-blue-500 ml-0.5 align-middle" />
            )}
            <div ref={streamedEndRef} />
          </div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <button
          onClick={() => onReject(revision.commentMarkId)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="취소"
        >
          <X className="h-3.5 w-3.5" /> 취소
        </button>

        <button
          onClick={() => onAccept(revision.commentMarkId)}
          disabled={!isComplete || !revision.streamedText}
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
          aria-label="적용"
        >
          <Check className="h-3.5 w-3.5" /> 적용
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 테스트 실행 - PASS 확인**

```bash
cd notion/apps/web && npx vitest run src/components/editor/__tests__/revision-overlay.test.tsx
```
Expected: 5 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add notion/apps/web/src/components/editor/revision-overlay.tsx \
        notion/apps/web/src/components/editor/__tests__/revision-overlay.test.tsx
git commit -m "feat(editor): add RevisionOverlay — real-time streaming diff UI with accept/reject"
```

---

## Task 7: collaborative-editor.tsx 통합 — 전체 파이프라인 연결

**Files:**
- Modify: `notion/apps/web/src/components/editor/collaborative-editor.tsx`

지금까지 만든 모든 컴포넌트와 Hook을 `collaborative-editor.tsx`에 통합한다.

- [ ] **Step 1: 에이전트 목록을 resolveAgentId에서 활용할 수 있도록 sidebar agents state 확인**

`notion/apps/web/src/components/editor/collaborative-editor.tsx` 파일에서 에이전트 목록이 어떻게 로드되는지 확인한다. 에이전트 목록이 `workspaceMembers` 또는 별도 state에 있다면 `resolveAgentId` 구현에 활용한다.

- [ ] **Step 2: import 및 상태 추가**

파일 상단 import 섹션에 추가:

```typescript
import { CommentSidebar } from './comment-sidebar'
import { RevisionOverlay } from './revision-overlay'
import { useCommentAgent } from './use-comment-agent'
import type { Comment as CommentType } from '@/types/comment'  // 기존 Comment 타입 활용
```

컴포넌트 내부 state 추가:

```typescript
// 코멘트 목록 (페이지 로드 시 fetch)
const [pageComments, setPageComments] = useState<CommentType[]>([])

// RevisionOverlay용 앵커 DOM rect (마크 위치 추적)
const [revisionAnchorRects, setRevisionAnchorRects] = useState<Map<string, DOMRect>>(new Map())
```

- [ ] **Step 3: useCommentAgent Hook 연결**

```typescript
// 에이전트 이름 → ID 조회 함수
const resolveAgentId = useCallback(
  (name: string) => {
    // agentsList는 기존 collaborative-editor에서 에이전트 사이드바용으로 로드한 배열 활용
    // 없으면 workspaceMembers에서 isAgent인 것들 사용
    return agentsList?.find(
      (a) => a.name.toLowerCase().includes(name.toLowerCase()),
    )?.id
  },
  [agentsList],
)

const { revisions, startRevision, acceptRevision, rejectRevision } = useCommentAgent({
  workspaceId,
  pageId,
  editorRef,
  resolveAgentId,
})
```

- [ ] **Step 4: handleCommentSubmit에서 startRevision 연결**

Task 2 Step 5에서 주석 처리했던 `handleRevisionInvoke` 호출 부분을 실제로 연결:

```typescript
const handleCommentSubmit = useCallback(async (content: string) => {
  const editor = editorRef.current
  if (!editor) return
  const { from, to } = editor.state.selection
  const selectedText = editor.state.doc.textBetween(from, to, ' ')
  const commentMarkId = `cm_${nanoid(8)}`

  // 선택 텍스트에 CommentHighlight 마크 적용
  editor.commands.setTextSelection({ from, to })
  editor.commands.setCommentHighlight({ commentId: commentMarkId, status: 'active' })
  editor.commands.setTextSelection(to)

  // DB에 코멘트 저장
  const res = await fetch(`/api/v1/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockId: pageId,
      content: { text: content, selectedText, commentMarkId },
    }),
  })
  const newComment = await res.json()
  setPageComments((prev) => [newComment, ...prev])

  setBubblePosition(null)

  // @멘션이 있으면 즉시 첨삭 시작
  if (content.includes('@')) {
    await startRevision({ commentMarkId, commentText: content, selectedText })
  }
}, [pageId, startRevision])
```

- [ ] **Step 5: 코멘트 클릭 시 에디터 스크롤 + DOM rect 계산 연결**

```typescript
const handleCommentClick = useCallback(
  (commentMarkId: string) => {
    const editor = editorRef.current
    if (!editor) return

    // 마크 위치로 이동
    const range = editor.commands.getCommentHighlightRange(commentMarkId)
    if (!range) return

    editor.commands.setTextSelection(range.from)
    editor.commands.scrollIntoView()

    // DOM 위치 계산 (RevisionOverlay anchor)
    const coords = editor.view.coordsAtPos(range.from)
    const endCoords = editor.view.coordsAtPos(range.to)
    const rect = new DOMRect(
      coords.left,
      coords.top,
      endCoords.right - coords.left,
      endCoords.bottom - coords.top,
    )
    setRevisionAnchorRects((prev) => new Map(prev).set(commentMarkId, rect))
  },
  [],
)
```

- [ ] **Step 6: 코멘트 해결/삭제 핸들러**

```typescript
const handleResolveComment = useCallback(async (commentId: string) => {
  await fetch(`/api/v1/comments/${commentId}/resolve`, { method: 'PATCH' })
  setPageComments((prev) =>
    prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
  )
  // 해결된 코멘트의 마크 status도 resolved로 변경
  const comment = pageComments.find((c) => c.id === commentId)
  if (comment?.content.commentMarkId) {
    editorRef.current?.commands.updateCommentHighlightStatus(
      comment.content.commentMarkId,
      'resolved',
    )
  }
}, [pageComments])

const handleDeleteComment = useCallback(async (commentId: string) => {
  await fetch(`/api/v1/comments/${commentId}`, { method: 'DELETE' })
  const comment = pageComments.find((c) => c.id === commentId)
  if (comment?.content.commentMarkId) {
    editorRef.current?.commands.removeCommentHighlight(comment.content.commentMarkId)
  }
  setPageComments((prev) => prev.filter((c) => c.id !== commentId))
}, [pageComments])
```

- [ ] **Step 7: 페이지 로드 시 코멘트 fetch**

기존 페이지 데이터 로드 useEffect 안에 추가:

```typescript
// 기존 페이지 로드 effect 내부에 추가
const commentsRes = await fetch(`/api/v1/comments?block_id=${pageId}`)
if (commentsRes.ok) {
  const comments = await commentsRes.json()
  setPageComments(comments)
  // DB에서 불러온 코멘트의 마크를 에디터에 복원 (Yjs 문서에 이미 마크가 포함되어 있으면 자동 복원됨)
}
```

- [ ] **Step 8: JSX에 CommentSidebar + RevisionOverlay 추가**

에디터 레이아웃을 수정해 사이드바 포함:

```tsx
// 기존 에디터 래퍼를 flex layout으로 변경
<div className="flex h-full">
  {/* 에디터 본문 */}
  <div ref={editorContainerRef} className="relative flex-1 overflow-auto">
    <EditorContent editor={editor} />
    <CommentBubble
      position={bubblePosition}
      onSubmit={handleCommentSubmit}
      onClose={() => setBubblePosition(null)}
    />

    {/* RevisionOverlay들: 각 진행 중인 첨삭마다 */}
    {[...revisions.values()].map((revision) => (
      <RevisionOverlay
        key={revision.commentMarkId}
        revision={revision}
        anchorRect={revisionAnchorRects.get(revision.commentMarkId) ?? null}
        onAccept={acceptRevision}
        onReject={rejectRevision}
      />
    ))}
  </div>

  {/* 코멘트 사이드바 */}
  {pageComments.length > 0 && (
    <CommentSidebar
      comments={pageComments}
      onCommentClick={handleCommentClick}
      onResolve={handleResolveComment}
      onDelete={handleDeleteComment}
    />
  )}
</div>
```

- [ ] **Step 9: 통합 시나리오 수동 검증**

개발 서버를 실행하고 다음 시나리오를 직접 테스트:

```bash
cd notion && pnpm dev
```

1. 에이전트가 실시간으로 텍스트를 작성하는 것을 확인 (기존 기능)
2. 작성된 텍스트를 드래그 선택 → 노란 "+" 버튼이 나타남을 확인
3. "+" 버튼 클릭 → 코멘트 입력창 열림, 선택 텍스트 인용 표시됨
4. `@에이전트이름 이 부분을 더 간결하게 수정해줘` 입력 후 저장
5. 에디터에서 선택 텍스트가 노란 하이라이트 → 파란 점선 하이라이트로 전환됨
6. RevisionOverlay가 원본/첨삭 두 섹션으로 나타남
7. 에이전트 첨삭 텍스트가 실시간으로 타이핑되는 것을 확인 (핵심!)
8. 완료 후 "적용" 버튼이 활성화됨
9. 적용 클릭 → 에디터 내 텍스트가 첨삭 버전으로 교체됨
10. 코멘트 사이드바에서 해당 코멘트가 표시됨 확인

- [ ] **Step 10: 커밋**

```bash
git add notion/apps/web/src/components/editor/collaborative-editor.tsx
git commit -m "feat(editor): integrate comment-agent revision pipeline into collaborative editor"
```

---

## Task 8: 코멘트 persist — DB 스키마 및 comments API 응답 보강

**Files:**
- Modify: `notion/apps/api/src/routes/comments.ts`

기존 코멘트 API는 `content: { text }` 구조를 저장한다. `selectedText`와 `commentMarkId`가 포함된 확장 구조를 그대로 수용하도록 유효성 검사를 업데이트한다.

- [ ] **Step 1: comments.ts의 createCommentSchema 확인 및 수정**

`notion/apps/api/src/routes/comments.ts` 에서 `createCommentSchema`를 찾아 content 타입을 유연하게 수정:

현재:
```typescript
const createCommentSchema = z.object({
  blockId: z.string(),
  content: z.object({ text: z.string() }),
  threadId: z.string().optional(),
})
```

변경:
```typescript
const createCommentSchema = z.object({
  blockId: z.string(),
  content: z.object({
    text: z.string(),
    selectedText: z.string().optional(),
    commentMarkId: z.string().optional(),
  }),
  threadId: z.string().optional(),
})
```

- [ ] **Step 2: GET /comments 응답에서 replies 포함 확인**

기존 GET /comments 라우트가 이미 replies를 include하는지 확인. 없으면 추가:

```typescript
include: {
  author: { select: { id: true, name: true, avatar: true } },
  replies: {
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  },
},
```

- [ ] **Step 3: 커밋**

```bash
git add notion/apps/api/src/routes/comments.ts
git commit -m "feat(api): extend comment content schema to support selectedText and commentMarkId"
```

---

## Self-Review

### Spec Coverage

| 요구사항 | 담당 Task |
|---------|----------|
| 에이전트 실시간 글쓰기 표시 | 기존 기능 (변경 없음) |
| 텍스트 드래그 후 코멘트 달기 | Task 1 (CommentHighlight Mark), Task 2 (CommentBubble) |
| 코멘트에서 에이전트 @멘션 | Task 2 (CommentBubble textarea), Task 5 (parseAgentMentions) |
| 에이전트 첨삭 (원본 텍스트 기반) | Task 4 (/agents/revise endpoint) |
| 첨삭 과정 실시간 표시 (핵심) | Task 6 (RevisionOverlay 스트리밍 UI) |
| 첨삭 Accept/Reject | Task 5 (acceptRevision/rejectRevision), Task 6 (버튼 UI) |
| 코멘트 목록 사이드바 | Task 3 (CommentSidebar) |
| 협업 동기화 (Yjs) | CommentHighlight Mark가 Yjs 문서에 저장되어 자동 동기화 |

### Placeholder 검사

코드 샘플에 TBD, TODO, "비슷하게 구현" 등의 표현 없음 — 모든 스텝에 실제 코드 포함.

### 타입 일관성 검사

- `RevisionState.commentMarkId` — Task 5에서 정의, Task 6 `RevisionOverlay` props에서 동일하게 사용
- `CommentHighlight` 커맨드 `setCommentHighlight`, `removeCommentHighlight`, `updateCommentHighlightStatus`, `getCommentHighlightRange` — Task 1에서 정의, Task 2와 Task 7에서 동일 이름으로 호출
- `CommentBubblePosition.selectedText` — Task 2에서 정의, `handleCommentSubmit`에서 `selectedText` 필드로 접근
- `parseAgentMentions.withInstruction` — Task 5에서 함수 프로퍼티로 정의, `startRevision` 내부에서 호출
