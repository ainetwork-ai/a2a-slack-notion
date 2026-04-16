'use client'

import { useEffect, useRef } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import type { RevisionState } from './use-comment-agent'

interface RevisionOverlayProps {
  revision: RevisionState
  anchorRect: DOMRect | null
  onAccept: (commentMarkId: string) => void
  onReject: (commentMarkId: string) => void
}

export function RevisionOverlay({ revision, anchorRect, onAccept, onReject }: RevisionOverlayProps) {
  const streamedEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    streamedEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [revision.streamedText])

  const isStreaming = revision.status === 'streaming'
  const isComplete = revision.status === 'complete'

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
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            원본
          </p>
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500">
            {revision.originalText}
          </p>
        </div>

        <div className="flex items-center gap-2 text-zinc-300">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs">↓</span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>

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
