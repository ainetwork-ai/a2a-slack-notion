/**
 * CLI: export a Notion page to Markdown.
 *
 * Usage:
 *   npx tsx scripts/export-page.ts <pageId> [--out file.md]
 *
 * Examples:
 *   npx tsx scripts/export-page.ts 550e8400-e29b-41d4-a716-446655440000
 *   npx tsx scripts/export-page.ts 550e8400-e29b-41d4-a716-446655440000 --out ./my-page.md
 *
 * Prints a stats footer to stderr:
 *   blocks: N  headings: N  words: N
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectPageTree } from '../src/lib/notion/export/collect-tree';
import { blocksToMarkdown } from '../src/lib/notion/export/blocks-to-markdown';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.error('Usage: npx tsx scripts/export-page.ts <pageId> [--out file.md]');
  process.exit(1);
}

const pageId = args[0];
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

if (outIdx !== -1 && !outFile) {
  console.error('Error: --out requires a file path argument');
  process.exit(1);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function countWords(md: string): number {
  return md
    .replace(/```[\s\S]*?```/g, '') // strip code blocks
    .replace(/<!--[\s\S]*?-->/g, '') // strip HTML comments
    .split(/\s+/)
    .filter(Boolean).length;
}

function countHeadings(md: string): number {
  return (md.match(/^#{1,6}\s/gm) ?? []).length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const tree = await collectPageTree(pageId);
  const markdown = blocksToMarkdown(tree.page, tree.blocks);

  if (outFile) {
    const resolved = path.resolve(outFile);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, markdown, 'utf8');
    console.error(`Written to ${resolved}`);
  } else {
    process.stdout.write(markdown);
    // Ensure trailing newline for piping
    if (!markdown.endsWith('\n')) process.stdout.write('\n');
  }

  // Stats footer to stderr (doesn't pollute stdout when piping)
  const blockCount = tree.blocks.length + 1; // +1 for root page
  const headingCount = countHeadings(markdown);
  const wordCount = countWords(markdown);
  console.error(`\nblocks: ${blockCount}  headings: ${headingCount}  words: ${wordCount}`);
}

main().catch((err: unknown) => {
  console.error('Export failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
