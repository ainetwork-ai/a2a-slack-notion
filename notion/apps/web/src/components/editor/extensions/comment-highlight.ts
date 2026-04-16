import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentHighlight: {
      setCommentHighlight: (attrs: { commentId: string; status: CommentHighlightStatus }) => ReturnType
      removeCommentHighlight: (commentId: string) => ReturnType
      updateCommentHighlightStatus: (commentId: string, status: CommentHighlightStatus) => ReturnType
      getCommentHighlightRange: (commentId: string) => ReturnType
    }
  }
}

export type CommentHighlightStatus = 'active' | 'revision-in-progress' | 'resolved'

export interface CommentHighlightRange {
  from: number
  to: number
  text: string
}

/** Find the range of a comment highlight mark by commentId in the given editor state. */
export function findCommentHighlightRange(
  doc: ProseMirrorNode,
  commentId: string,
): CommentHighlightRange | null {
  let from = -1
  let to = -1
  let text = ''
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (!node.isText) return
    node.marks.forEach((mark) => {
      if (mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentId) {
        if (from === -1) from = pos
        to = pos + node.nodeSize
        text += node.text ?? ''
      }
    })
  })
  if (from === -1) return null
  return { from, to, text }
}

export const CommentHighlight = Mark.create({
  name: 'commentHighlight',
  spanning: true,
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-comment-id'),
        renderHTML: ({ commentId }: { commentId: string }) => ({ 'data-comment-id': commentId }),
      },
      status: {
        default: 'active' as CommentHighlightStatus,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-status') ?? 'active',
        renderHTML: ({ status }: { status: CommentHighlightStatus }) => ({ 'data-status': status }),
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
        (commentId: string) =>
        ({ state, dispatch }) => {
          const { doc, tr } = state
          doc.descendants((node: ProseMirrorNode, pos: number) => {
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
        (commentId: string, status: CommentHighlightStatus) =>
        ({ state, dispatch }) => {
          const { doc, tr } = state
          doc.descendants((node: ProseMirrorNode, pos: number) => {
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
        (commentId: string) =>
        ({ state }) => {
          // Stores result in the extension storage so callers can retrieve it.
          // At runtime, Tiptap also returns this value from editor.commands.getCommentHighlightRange().
          const result = findCommentHighlightRange(state.doc, commentId)
          this.storage.lastRange = result
          return true
        },
    }
  },

  addStorage() {
    return {
      lastRange: null as CommentHighlightRange | null,
    }
  },
})
