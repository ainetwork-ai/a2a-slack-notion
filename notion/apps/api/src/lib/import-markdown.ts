// ---------------------------------------------------------------------------
// Markdown → Block tree parser
// ---------------------------------------------------------------------------
// Uses a simple line-by-line parser — no heavy dependencies.

export interface BlockCreateInput {
  type: string;
  properties: Record<string, unknown>;
  content: Record<string, unknown>;
  children?: BlockCreateInput[];
}

// Wrap plain text into Tiptap paragraph JSON
function makeTiptapContent(text: string): Record<string, unknown> {
  if (!text) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

// Wrap code text (may be multi-line) into Tiptap code_block JSON
function makeTiptapCode(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Parse states for fenced code blocks
// ---------------------------------------------------------------------------

interface CodeAccumulator {
  language: string;
  lines: string[];
}

export function markdownToBlocks(md: string): BlockCreateInput[] {
  const lines = md.split('\n');
  const blocks: BlockCreateInput[] = [];

  let codeAccum: CodeAccumulator | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // ── Fenced code block (``` ... ```) ──────────────────────────────────
    if (codeAccum !== null) {
      if (line.trimStart().startsWith('```')) {
        // End of code block
        blocks.push({
          type: 'code',
          properties: { language: codeAccum.language },
          content: makeTiptapCode(codeAccum.lines.join('\n')),
        });
        codeAccum = null;
      } else {
        codeAccum.lines.push(line);
      }
      continue;
    }

    if (line.trimStart().startsWith('```')) {
      const language = line.trimStart().slice(3).trim();
      codeAccum = { language, lines: [] };
      continue;
    }

    // ── Headings ──────────────────────────────────────────────────────────
    const h3Match = /^### (.+)/.exec(line);
    if (h3Match) {
      const text = h3Match[1] ?? '';
      blocks.push({ type: 'heading_3', properties: {}, content: makeTiptapContent(text) });
      continue;
    }

    const h2Match = /^## (.+)/.exec(line);
    if (h2Match) {
      const text = h2Match[1] ?? '';
      blocks.push({ type: 'heading_2', properties: {}, content: makeTiptapContent(text) });
      continue;
    }

    const h1Match = /^# (.+)/.exec(line);
    if (h1Match) {
      const text = h1Match[1] ?? '';
      blocks.push({ type: 'heading_1', properties: {}, content: makeTiptapContent(text) });
      continue;
    }

    // ── Divider ───────────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'divider', properties: {}, content: {} });
      continue;
    }

    // ── To-do items ───────────────────────────────────────────────────────
    const todoCheckedMatch = /^- \[x\] (.*)/.exec(line);
    if (todoCheckedMatch) {
      const text = todoCheckedMatch[1] ?? '';
      blocks.push({
        type: 'to_do',
        properties: { checked: true },
        content: makeTiptapContent(text),
      });
      continue;
    }

    const todoUncheckedMatch = /^- \[ \] (.*)/.exec(line);
    if (todoUncheckedMatch) {
      const text = todoUncheckedMatch[1] ?? '';
      blocks.push({
        type: 'to_do',
        properties: { checked: false },
        content: makeTiptapContent(text),
      });
      continue;
    }

    // ── Bulleted list ─────────────────────────────────────────────────────
    const bulletMatch = /^- (.*)/.exec(line);
    if (bulletMatch) {
      const text = bulletMatch[1] ?? '';
      blocks.push({ type: 'bulleted_list', properties: {}, content: makeTiptapContent(text) });
      continue;
    }

    // ── Numbered list ─────────────────────────────────────────────────────
    const numberedMatch = /^\d+\. (.*)/.exec(line);
    if (numberedMatch) {
      const text = numberedMatch[1] ?? '';
      blocks.push({ type: 'numbered_list', properties: {}, content: makeTiptapContent(text) });
      continue;
    }

    // ── Blockquote ────────────────────────────────────────────────────────
    const quoteMatch = /^> (.*)/.exec(line);
    if (quoteMatch) {
      const text = quoteMatch[1] ?? '';
      blocks.push({ type: 'quote', properties: {}, content: makeTiptapContent(text) });
      continue;
    }

    // ── Image ─────────────────────────────────────────────────────────────
    const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(line);
    if (imageMatch) {
      const alt = imageMatch[1] ?? '';
      const url = imageMatch[2] ?? '';
      blocks.push({
        type: 'image',
        properties: { url, caption: alt },
        content: {},
      });
      continue;
    }

    // ── Empty line ────────────────────────────────────────────────────────
    if (line.trim() === '') {
      // Don't emit a block for empty lines
      continue;
    }

    // ── Default: text paragraph ───────────────────────────────────────────
    blocks.push({ type: 'text', properties: {}, content: makeTiptapContent(line.trim()) });
  }

  // If code block was never closed, flush it
  if (codeAccum !== null) {
    blocks.push({
      type: 'code',
      properties: { language: codeAccum.language },
      content: makeTiptapCode(codeAccum.lines.join('\n')),
    });
  }

  return blocks;
}
