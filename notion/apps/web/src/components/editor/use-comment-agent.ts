import { useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { findCommentHighlightRange } from './extensions/comment-highlight'

export interface RevisionState {
  commentMarkId: string
  agentId: string
  agentName: string
  status: 'streaming' | 'complete' | 'accepted' | 'rejected'
  streamedText: string
  originalText: string
}

export function parseAgentMentions(text: string): string[] {
  const matches = text.matchAll(/@(\S+)/g)
  return [...matches].map((m) => m[1] as string)
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

      const agentName = mentions[0] as string
      const agentId = resolveAgentId(agentName)
      if (!agentId) {
        console.warn(`Agent not found: ${agentName}`)
        return
      }
      const resolvedAgentId: string = agentId

      const editor = editorRef.current
      if (!editor) return

      editor.commands.updateCommentHighlightStatus(params.commentMarkId, 'revision-in-progress')

      setRevisions((prev) => {
        const next = new Map(prev)
        next.set(params.commentMarkId, {
          commentMarkId: params.commentMarkId,
          agentId: resolvedAgentId,
          agentName,
          status: 'streaming',
          streamedText: '',
          originalText: params.selectedText,
        })
        return next
      })

      const controller = new AbortController()
      abortControllers.current.set(params.commentMarkId, controller)

      const apiUrl =
        process.env['NEXT_PUBLIC_API_URL'] ??
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:3011`
          : 'http://localhost:3011')

      try {
        const response = await fetch(`${apiUrl}/api/v1/agents/revise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            agentId: resolvedAgentId,
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
          editorRef.current?.commands.updateCommentHighlightStatus(params.commentMarkId, 'active')
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

      const range = findCommentHighlightRange(editor.state.doc, commentMarkId)
      if (range) {
        editor
          .chain()
          .setTextSelection({ from: range.from, to: range.to })
          .deleteSelection()
          .insertContent(revision.streamedText)
          .run()
      }

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

      abortControllers.current.get(commentMarkId)?.abort()
      abortControllers.current.delete(commentMarkId)

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
