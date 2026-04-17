/**
 * Markdown → Notion block tree parser.
 *
 * Extracted from scripts/migrate-canvas-to-blocks.ts so that both the one-shot
 * migrator AND runtime callers (e.g. the a2a builder-agent when an article
 * enters `draft`) can share a single implementation.
 *
 * The parser is intentionally small: it recognises the shapes slack's canvases
 * and article drafts contain in practice — headings (h1-h3), paragraphs,
 * bulleted/numbered lists, to-do items, blockquotes, code fences, and
 * horizontal rules. Unknown lines fall back to `text` so no content is lost.
 *
 * Shape:
 *   parseMarkdownToBlocks("# Title\n\nHello world")
 *     → [
 *         { type: 'heading_1', content: { text: 'Title' } },
 *         { type: 'text',      content: { text: 'Hello world' } },
 *       ]
 */

// NOTE: BlockType is duplicated inline here rather than imported from
// '@/lib/db/schema' because the notion-core types live in a shared table
// definition owned by another agent and may not be present in the schema
// during cross-agent migration windows. Keeping this lib self-contained lets
// it compile regardless. When the schema export stabilises, callers can cast.
export type BlockType =
  | 'page' | 'text' | 'heading_1' | 'heading_2' | 'heading_3'
  | 'bulleted_list' | 'numbered_list' | 'to_do' | 'toggle' | 'callout'
  | 'code' | 'divider' | 'image' | 'quote' | 'table' | 'bookmark'
  | 'file' | 'embed' | 'database';

export type DraftBlock = {
  type: BlockType;
  content: Record<string, unknown>;
  properties?: Record<string, unknown>;
};

/**
 * Parse markdown into a flat list of block descriptors suitable for direct
 * insertion into the `blocks` table (as children of a page).
 *
 * Header mapping:  `# → heading_1`, `## → heading_2`, `### → heading_3`.
 * List flattening: every `- item` becomes a top-level `bulleted_list` block
 *                  (no nesting). Numbered lists become `numbered_list`.
 * Todo items:      `- [ ] / - [x]` → `to_do` with `properties.checked`.
 * Code fences:     ```lang` carried into `content.language`.
 * Blockquotes:     consecutive `>` lines merged into one `quote` block.
 * HR:              `---`, `***`, `___` → `divider`.
 * Paragraphs:      consecutive non-blank, non-special lines → `text`.
 */
export function parseMarkdownToBlocks(src: string): DraftBlock[] {
  const out: DraftBlock[] = [];
  const lines = src.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang\n...\n```
    const codeFence = line.match(/^```(\w*)\s*$/);
    if (codeFence) {
      const lang = codeFence[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push({ type: 'code', content: { text: codeLines.join('\n'), language: lang } });
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      out.push({ type: 'divider', content: {} });
      i++;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const type = (`heading_${level}` as BlockType);
      out.push({ type, content: { text: h[2].trim() } });
      i++;
      continue;
    }

    // Blockquote (one or more consecutive > lines)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push({ type: 'quote', content: { text: quoteLines.join('\n') } });
      continue;
    }

    // To-do (- [ ] or - [x])
    const todo = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (todo) {
      out.push({
        type: 'to_do',
        content: { text: todo[2] },
        properties: { checked: todo[1].toLowerCase() === 'x' },
      });
      i++;
      continue;
    }

    // Bulleted list item
    if (/^[-*+]\s+/.test(line)) {
      out.push({ type: 'bulleted_list', content: { text: line.replace(/^[-*+]\s+/, '') } });
      i++;
      continue;
    }

    // Numbered list item
    if (/^\d+\.\s+/.test(line)) {
      out.push({ type: 'numbered_list', content: { text: line.replace(/^\d+\.\s+/, '') } });
      i++;
      continue;
    }

    // Blank line — skip (we group paragraphs on non-blank runs below)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}|[-*+]\s|\d+\.\s|>\s|```)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push({ type: 'text', content: { text: paraLines.join('\n') } });
    }
  }

  return out;
}
