'use client'

import { useState } from 'react'
import { CheckCircle, Circle, Trash2 } from 'lucide-react'

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

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
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
          <p className="mb-2 truncate rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-400 italic dark:bg-zinc-800">
            &quot;{comment.content.selectedText.slice(0, 50)}&quot;
          </p>

          <p className="text-sm text-zinc-700 dark:text-zinc-300">{comment.content.text}</p>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">
              {comment.author.name} · {relativeTime(comment.createdAt)}
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
