'use client';

/**
 * Canvas markdown renderer — react-markdown + remark-gfm + syntax highlighting
 * for the repo's existing regex-based highlighter (`@/lib/syntax-highlight`).
 *
 * Used by the Canvas preview mode. Renders h1-h6, ul/ol, fenced code blocks,
 * tables, blockquotes, and links. All styling happens via Tailwind's `prose`
 * utilities in the parent container, plus a few class overrides below.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightCode } from '@/lib/syntax-highlight';

interface CanvasMarkdownProps {
  content: string;
}

export function CanvasMarkdown({ content }: CanvasMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Fenced code blocks: use syntax-highlight.ts for color tokens.
        // Inline code falls through to default rendering.
        code(props) {
          const { className, children, ...rest } = props;
          const inline = !className;
          const codeText = String(children ?? '').replace(/\n$/, '');
          if (inline) {
            return (
              <code
                className="px-1 py-0.5 rounded bg-white/10 text-[0.9em] font-mono text-slate-100"
                {...rest}
              >
                {children}
              </code>
            );
          }
          const langMatch = /language-(\w+)/.exec(className ?? '');
          const lang = langMatch?.[1] ?? '';
          const html = highlightCode(codeText, lang);
          return (
            <code
              className="block font-mono text-[13px] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        },
        pre({ children }) {
          return (
            <pre className="bg-black/30 border border-white/10 rounded p-3 overflow-x-auto my-3">
              {children}
            </pre>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
            >
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="border-collapse border border-white/10 text-sm">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="border border-white/10 px-2 py-1 bg-white/5 text-left font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border border-white/10 px-2 py-1">{children}</td>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-white/20 pl-3 text-slate-400 italic my-3">
              {children}
            </blockquote>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
