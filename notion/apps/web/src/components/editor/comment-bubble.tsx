'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquarePlus, X, Send } from 'lucide-react'
import { MentionList, type MentionItem, type MentionListRef } from './mention-list'

export interface CommentBubblePosition {
  top: number
  left: number
  selectedText: string
}

interface CommentBubbleProps {
  position: CommentBubblePosition | null
  onSubmit: (content: string) => void
  onClose: () => void
  workspaceId: string
}

const getApiUrl = () =>
  process.env['NEXT_PUBLIC_API_URL'] ??
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3011`
    : '')

export function CommentBubble({ position, onSubmit, onClose, workspaceId }: CommentBubbleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([])
  const mentionListRef = useRef<MentionListRef>(null)

  useEffect(() => {
    setIsOpen(false)
    setContent('')
    setMentionQuery(null)
    setMentionItems([])
  }, [position])

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  // Fetch mention suggestions with 150ms debounce
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionItems([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${getApiUrl()}/api/v1/mentions/suggest?type=user&type=agent&q=${encodeURIComponent(mentionQuery)}&workspace_id=${workspaceId}`,
          { credentials: 'include' },
        )
        if (res.ok) {
          const data = await res.json()
          setMentionItems(Array.isArray(data) ? data : (data.items ?? []))
        }
      } catch {
        setMentionItems([])
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [mentionQuery, workspaceId])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setContent(val)

    // Detect @mention from cursor position
    const cursor = e.target.selectionStart ?? val.length
    const textBeforeCursor = val.slice(0, cursor)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex !== -1) {
      const afterAt = textBeforeCursor.slice(atIndex + 1)
      // Active mention: no space after @
      if (!afterAt.includes(' ')) {
        setMentionQuery(afterAt)
        return
      }
    }
    setMentionQuery(null)
  }

  const handleMentionSelect = (item: MentionItem) => {
    const cursor = textareaRef.current?.selectionStart ?? content.length
    const textBeforeCursor = content.slice(0, cursor)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    if (atIndex !== -1) {
      const newContent =
        content.slice(0, atIndex) + `@${item.name} ` + content.slice(cursor)
      setContent(newContent)
    }
    setMentionQuery(null)
    setMentionItems([])
    // Restore focus to textarea
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleSubmit = () => {
    const trimmed = content.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setContent('')
    setIsOpen(false)
    setMentionQuery(null)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Delegate arrow/enter to mention list when open
    if (mentionQuery !== null && mentionItems.length > 0) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        mentionListRef.current?.onKeyDown({ event: e.nativeEvent })
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        mentionListRef.current?.onKeyDown({ event: e.nativeEvent })
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
      onClose()
    }
  }

  if (!position) return null

  return (
    <div
      className="absolute z-50 flex flex-col items-end gap-2"
      style={{ top: position.top, left: position.left }}
    >
      {!isOpen && (
        <button
          aria-label="comment"
          onClick={() => setIsOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 shadow-md hover:bg-yellow-500 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4 text-white" />
        </button>
      )}

      {isOpen && (
        <div className="w-72 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {/* 선택된 텍스트 인용 */}
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="truncate text-xs text-zinc-400 italic">
              &quot;{position.selectedText.slice(0, 60)}
              {position.selectedText.length > 60 ? '…' : ''}&quot;
            </p>
          </div>

          {/* 입력 영역 + 멘션 드롭다운 */}
          <div className="relative p-3">
            {/* @멘션 드롭다운 — textarea 위에 표시 */}
            {mentionQuery !== null && (
              <div className="absolute left-3 right-3 bottom-full mb-1 z-50">
                <MentionList
                  ref={mentionListRef}
                  items={mentionItems}
                  command={handleMentionSelect}
                />
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="코멘트 작성 (에이전트 멘션: @이름)"
              rows={3}
              className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center justify-between px-3 pb-3">
            <button
              onClick={() => {
                setIsOpen(false)
                onClose()
              }}
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
