/**
 * Pure converter: Notion block tree → GitHub-flavored Markdown.
 *
 * No IO. Accepts the root page block plus all descendant blocks
 * (as returned by collectPageTree) and serialises to GFM.
 *
 * Tree traversal: DFS pre-order (parent rendered before children).
 * Children order is determined by the parent block's `childrenOrder` array;
 * blocks not referenced in any childrenOrder fall back to insertion order.
 */

// ── Minimal block shape (mirrors the DB schema without importing drizzle) ────

export interface Block {
  id: string;
  type: string;
  parentId: string | null;
  pageId: string;
  properties: Record<string, unknown>;
  content: Record<string, unknown>;
  childrenOrder: string[];
  archived?: boolean;
}

// ── Helper: safely extract a string from block content/properties ────────────

function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

// ── Table renderer (GFM) ─────────────────────────────────────────────────────

function renderTable(block: Block, childMap: Map<string, Block[]>): string {
  const rows = childMap.get(block.id) ?? [];
  if (rows.length === 0) return '';

  const lines: string[] = [];
  rows.forEach((row, idx) => {
    const cells = (childMap.get(row.id) ?? []).map((cell) => {
      return str(cell.content, 'text').replace(/\|/g, '\\|');
    });
    const rowStr = `| ${cells.join(' | ')} |`;
    lines.push(rowStr);
    // Add separator after first row (header)
    if (idx === 0) {
      const sep = `| ${cells.map(() => '---').join(' | ')} |`;
      lines.push(sep);
    }
  });

  return lines.join('\n');
}

// ── Database renderer ────────────────────────────────────────────────────────

function renderDatabase(block: Block, childMap: Map<string, Block[]>): string {
  const databaseId = block.id;
  const childPages = childMap.get(block.id) ?? [];
  const pageList = childPages
    .filter((b) => b.type === 'page')
    .map((b) => {
      const title = str(b.properties, 'title') || 'Untitled';
      return `- [${title}](${b.id})`;
    })
    .join('\n');

  return `<!-- database: ${databaseId} -->\n${pageList}`;
}

// ── Single-block renderer (no children) ─────────────────────────────────────

function renderBlock(
  block: Block,
  depth: number,
  childMap: Map<string, Block[]>,
): string {
  const indent = '  '.repeat(depth);
  const text = str(block.content, 'text');

  switch (block.type) {
    case 'page': {
      const title = str(block.properties, 'title') || 'Untitled';
      return `# ${title}`;
    }

    case 'text':
      return text || '';

    case 'heading_1':
      return `# ${text}`;

    case 'heading_2':
      return `## ${text}`;

    case 'heading_3':
      return `### ${text}`;

    case 'bulleted_list':
      return `${indent}- ${text}`;

    case 'numbered_list':
      return `${indent}1. ${text}`;

    case 'to_do': {
      const checked = block.properties.checked === true;
      return `${indent}- [${checked ? 'x' : ' '}] ${text}`;
    }

    case 'toggle': {
      // Children are rendered separately in the DFS walk; we wrap with HTML details.
      // The caller will inject child content into the placeholder.
      return `<details><summary>${text}</summary>`;
    }

    case 'callout':
      return `> ${text}`;

    case 'code': {
      const lang = str(block.content, 'language');
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }

    case 'divider':
      return '\n---';

    case 'image': {
      const url = str(block.content, 'url');
      const alt = str(block.content, 'alt') || str(block.properties, 'title') || 'image';
      return `![${alt}](${url})`;
    }

    case 'quote':
      return `> ${text}`;

    case 'table':
      return renderTable(block, childMap);

    case 'bookmark': {
      const url = str(block.content, 'url');
      const title = str(block.content, 'title') || str(block.properties, 'title') || url;
      return `[${title}](${url})`;
    }

    case 'file': {
      const url = str(block.content, 'url');
      const filename = str(block.content, 'filename') || str(block.properties, 'title') || url;
      return `[${filename}](${url})`;
    }

    case 'embed': {
      const url = str(block.content, 'url');
      return `[${url}](${url}) <!-- embed -->`;
    }

    case 'database':
      return renderDatabase(block, childMap);

    default:
      // Unknown block: fall back to content.text as plain paragraph
      return text || '';
  }
}

// ── DFS walk ─────────────────────────────────────────────────────────────────

function walk(
  blockId: string,
  blockById: Map<string, Block>,
  childMap: Map<string, Block[]>,
  depth: number,
  out: string[],
): void {
  const block = blockById.get(blockId);
  if (!block || block.archived) return;

  // Table rows and cells are rendered by renderTable directly — skip them here.
  const parentBlock = block.parentId ? blockById.get(block.parentId) : null;
  if (parentBlock?.type === 'table' || parentBlock?.type === 'table_row') return;

  const rendered = renderBlock(block, depth, childMap);

  if (block.type === 'toggle') {
    // Render toggle children inside the <details> block
    const children = childMap.get(block.id) ?? [];
    const childLines: string[] = [];
    for (const child of children) {
      walk(child.id, blockById, childMap, 0, childLines);
    }
    const inner = childLines.join('\n\n');
    out.push(`${rendered}\n\n${inner}\n\n</details>`);
    return;
  }

  if (rendered) out.push(rendered);

  // Recurse into children for non-toggle blocks (table handled internally)
  if (block.type !== 'table' && block.type !== 'database') {
    const children = childMap.get(block.id) ?? [];
    const childDepth = ['bulleted_list', 'numbered_list', 'to_do'].includes(block.type)
      ? depth + 1
      : depth;
    for (const child of children) {
      walk(child.id, blockById, childMap, childDepth, out);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts a Notion page block tree to GitHub-flavored Markdown.
 *
 * @param rootPage  The page block (type='page').
 * @param allBlocks All descendant blocks belonging to the same pageId.
 * @returns         GFM string.
 */
export function blocksToMarkdown(rootPage: Block, allBlocks: Block[]): string {
  // Build lookup maps
  const blockById = new Map<string, Block>();
  blockById.set(rootPage.id, rootPage);
  for (const b of allBlocks) {
    blockById.set(b.id, b);
  }

  // Build parent → ordered-children map using childrenOrder where available
  const childMap = new Map<string, Block[]>();

  for (const [id, block] of blockById) {
    if (!childMap.has(id)) childMap.set(id, []);

    const order: string[] = Array.isArray(block.childrenOrder) ? block.childrenOrder : [];
    if (order.length > 0) {
      // Use declared order
      const ordered: Block[] = order
        .map((cid) => blockById.get(cid))
        .filter((b): b is Block => b !== undefined);
      childMap.set(id, ordered);
    }
  }

  // For blocks not in any childrenOrder, append them to their parent (stable order)
  const referenced = new Set<string>();
  for (const [, children] of childMap) {
    for (const c of children) referenced.add(c.id);
  }
  // rootPage itself is not "referenced" (it's the root)
  referenced.add(rootPage.id);

  for (const b of allBlocks) {
    if (!referenced.has(b.id) && b.parentId) {
      const siblings = childMap.get(b.parentId) ?? [];
      siblings.push(b);
      childMap.set(b.parentId, siblings);
    }
  }

  // DFS from root
  const out: string[] = [];
  walk(rootPage.id, blockById, childMap, 0, out);

  // Top-level children of the page
  const topChildren = childMap.get(rootPage.id) ?? [];
  // Walk was only called for rootPage above; now walk children
  // Reset out and redo from root
  out.length = 0;

  // Render page title
  const title = str(rootPage.properties, 'title') || 'Untitled';
  out.push(`# ${title}`);

  for (const child of topChildren) {
    walk(child.id, blockById, childMap, 0, out);
  }

  return out
    .map((s) => s.trimEnd())
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
