import { prisma } from './prisma.js';

// ---------------------------------------------------------------------------
// Tiptap JSON → plain text
// ---------------------------------------------------------------------------

interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
  marks?: { type: string }[];
}

function extractText(node: TiptapNode | null | undefined): string {
  if (!node) return '';
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractText).join('');
  }
  return '';
}

function contentToText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const node = content as TiptapNode;
  if (node.type === 'doc' || node.type === 'paragraph') {
    return extractText(node);
  }
  return extractText(node);
}

// ---------------------------------------------------------------------------
// Block → Markdown lines
// ---------------------------------------------------------------------------

type Block = {
  id: string;
  type: string;
  properties: unknown;
  content: unknown;
  childrenOrder: string[];
};

function blockToMarkdown(block: Block, indent: number, numberedCounters: Map<string, number>): string[] {
  const pad = '  '.repeat(indent);
  const props = (block.properties ?? {}) as Record<string, unknown>;
  const text = contentToText(block.content) || (props['text'] as string) || '';

  switch (block.type) {
    case 'page': {
      const title = (props['title'] as string) || 'Untitled';
      return [`# ${title}`];
    }
    case 'heading_1':
      return [`${pad}# ${text}`];
    case 'heading_2':
      return [`${pad}## ${text}`];
    case 'heading_3':
      return [`${pad}### ${text}`];
    case 'text':
      return text ? [`${pad}${text}`] : [''];
    case 'bulleted_list':
      return [`${pad}- ${text}`];
    case 'numbered_list': {
      const parentKey = block.id; // counters are per-parent; handled by caller
      const n = (numberedCounters.get(parentKey) ?? 0) + 1;
      numberedCounters.set(parentKey, n);
      return [`${pad}${n}. ${text}`];
    }
    case 'to_do': {
      const checked = props['checked'] === true ? 'x' : ' ';
      return [`${pad}- [${checked}] ${text}`];
    }
    case 'toggle':
      return [
        `${pad}<details><summary>${text}</summary>`,
        `${pad}</details>`,
      ];
    case 'callout':
      return [`${pad}> ℹ️ ${text}`];
    case 'code': {
      const lang = (props['language'] as string) || '';
      return [
        `${pad}\`\`\`${lang}`,
        ...text.split('\n').map((l) => `${pad}${l}`),
        `${pad}\`\`\``,
      ];
    }
    case 'divider':
      return [`${pad}---`];
    case 'image': {
      const url = (props['url'] as string) || '';
      const alt = (props['caption'] as string) || 'image';
      return [`${pad}![${alt}](${url})`];
    }
    case 'quote':
      return [`${pad}> ${text}`];
    case 'bookmark': {
      const url = (props['url'] as string) || '';
      const title = (props['title'] as string) || url;
      return [`${pad}[${title}](${url})`];
    }
    case 'table': {
      // Table rows are stored as children blocks — handled at recursive level
      return [];
    }
    default:
      return text ? [`${pad}${text}`] : [];
  }
}

// ---------------------------------------------------------------------------
// Recursive tree traversal
// ---------------------------------------------------------------------------

async function renderBlocks(
  parentId: string,
  childrenOrder: string[],
  indent: number,
  numberedCounters: Map<string, number>,
): Promise<string[]> {
  const children = await prisma.block.findMany({
    where: { parentId, archived: false },
    select: {
      id: true,
      type: true,
      properties: true,
      content: true,
      childrenOrder: true,
    },
  });

  // Sort by childrenOrder if present, else by insertion order
  const ordered =
    childrenOrder.length > 0
      ? childrenOrder
          .map((id) => children.find((b) => b.id === id))
          .filter((b): b is NonNullable<typeof b> => b != null)
      : children;

  const lines: string[] = [];
  // Numbered list counters scoped to this parent
  const localCounters = new Map<string, number>();
  let listCounter = 0;

  for (const block of ordered) {
    const typedBlock: Block = {
      id: block.id,
      type: block.type,
      properties: block.properties,
      content: block.content,
      childrenOrder: block.childrenOrder,
    };

    // Track numbered list order within this parent
    if (block.type === 'numbered_list') {
      listCounter++;
      localCounters.set(block.id, listCounter);
    } else {
      listCounter = 0;
    }

    // Special case: table — render header row + separator + data rows from children
    if (block.type === 'table') {
      const tableRows = await prisma.block.findMany({
        where: { parentId: block.id, archived: false },
        select: { id: true, type: true, properties: true, content: true, childrenOrder: true },
        orderBy: { createdAt: 'asc' },
      });

      if (tableRows.length > 0) {
        // Simplified: extract text from each row's properties
        const rows = tableRows.map((row) => {
          const cells = (row.properties as Record<string, unknown>)['cells'];
          if (Array.isArray(cells)) {
            return `| ${cells.map((c) => String(c ?? '')).join(' | ')} |`;
          }
          const rowText = contentToText(row.content);
          return `| ${rowText} |`;
        });

        const firstRow = rows[0];
        if (firstRow !== undefined) {
          lines.push(firstRow);
          // Separator
          const cellCount = firstRow.split('|').length - 2;
          if (cellCount > 0) {
            lines.push(`| ${Array(cellCount).fill('---').join(' | ')} |`);
          }
          lines.push(...rows.slice(1));
        }
      }
      continue;
    }

    const blockLines = blockToMarkdown(
      { ...typedBlock, id: block.id },
      indent,
      localCounters,
    );
    // Override numbered_list counter from localCounters
    if (block.type === 'numbered_list') {
      const n = localCounters.get(block.id) ?? 1;
      // Re-render with correct number
      const pad = '  '.repeat(indent);
      const text = contentToText(block.content) || ((block.properties as Record<string, unknown>)['text'] as string) || '';
      lines.push(`${pad}${n}. ${text}`);
    } else {
      lines.push(...blockLines);
    }

    // Recurse into children
    if (block.childrenOrder.length > 0) {
      const childLines = await renderBlocks(
        block.id,
        block.childrenOrder,
        indent + 1,
        localCounters,
      );
      lines.push(...childLines);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function pageToMarkdown(pageId: string): Promise<string> {
  const page = await prisma.block.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      type: true,
      properties: true,
      content: true,
      childrenOrder: true,
    },
  });

  if (!page) throw new Error('Page not found');

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const title = (props['title'] as string) || 'Untitled';

  const lines: string[] = [`# ${title}`, ''];

  const childLines = await renderBlocks(pageId, page.childrenOrder, 0, new Map());
  lines.push(...childLines);

  return lines.join('\n');
}
