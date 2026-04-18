// Markdown → Block tree parser

export interface BlockCreateInput {
  type: string;
  properties: Record<string, unknown>;
  content: Record<string, unknown>;
  children?: BlockCreateInput[];
}

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

    if (codeAccum !== null) {
      if (line.trimStart().startsWith('```')) {
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

    const h3Match = /^### (.+)/.exec(line);
    if (h3Match) {
      blocks.push({ type: 'heading_3', properties: {}, content: makeTiptapContent(h3Match[1] ?? '') });
      continue;
    }

    const h2Match = /^## (.+)/.exec(line);
    if (h2Match) {
      blocks.push({ type: 'heading_2', properties: {}, content: makeTiptapContent(h2Match[1] ?? '') });
      continue;
    }

    const h1Match = /^# (.+)/.exec(line);
    if (h1Match) {
      blocks.push({ type: 'heading_1', properties: {}, content: makeTiptapContent(h1Match[1] ?? '') });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'divider', properties: {}, content: {} });
      continue;
    }

    const todoCheckedMatch = /^- \[x\] (.*)/.exec(line);
    if (todoCheckedMatch) {
      blocks.push({
        type: 'to_do',
        properties: { checked: true },
        content: makeTiptapContent(todoCheckedMatch[1] ?? ''),
      });
      continue;
    }

    const todoUncheckedMatch = /^- \[ \] (.*)/.exec(line);
    if (todoUncheckedMatch) {
      blocks.push({
        type: 'to_do',
        properties: { checked: false },
        content: makeTiptapContent(todoUncheckedMatch[1] ?? ''),
      });
      continue;
    }

    const bulletMatch = /^- (.*)/.exec(line);
    if (bulletMatch) {
      blocks.push({ type: 'bulleted_list', properties: {}, content: makeTiptapContent(bulletMatch[1] ?? '') });
      continue;
    }

    const numberedMatch = /^\d+\. (.*)/.exec(line);
    if (numberedMatch) {
      blocks.push({ type: 'numbered_list', properties: {}, content: makeTiptapContent(numberedMatch[1] ?? '') });
      continue;
    }

    const quoteMatch = /^> (.*)/.exec(line);
    if (quoteMatch) {
      blocks.push({ type: 'quote', properties: {}, content: makeTiptapContent(quoteMatch[1] ?? '') });
      continue;
    }

    const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(line);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        properties: { url: imageMatch[2] ?? '', caption: imageMatch[1] ?? '' },
        content: {},
      });
      continue;
    }

    if (line.trim() === '') {
      continue;
    }

    blocks.push({ type: 'text', properties: {}, content: makeTiptapContent(line.trim()) });
  }

  if (codeAccum !== null) {
    blocks.push({
      type: 'code',
      properties: { language: codeAccum.language },
      content: makeTiptapCode(codeAccum.lines.join('\n')),
    });
  }

  return blocks;
}
