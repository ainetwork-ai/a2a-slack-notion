/**
 * GET|POST /api/cron/reindex-search
 *
 * Shells out to `pnpm tsx scripts/meili-reindex.ts --index=<index>` because
 * the script initialises its own DB pool and Meilisearch client at module level,
 * making it unsuitable for direct import inside a Next.js edge/Node handler.
 *
 * Query param: ?index=messages|pages|blocks|users|all  (default: all)
 * Timeout: 5 minutes.
 *
 * Protected by CRON_SECRET (Authorization: Bearer or ?secret=).
 *
 * Returns: { indexed: { messages: N, pages: M, blocks: K, users: L } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { requireCronSecret } from '@/lib/cron/auth';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const VALID_INDEXES = new Set(['messages', 'pages', 'blocks', 'users', 'all']);

function runReindex(index: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Resolve the project root relative to this file at runtime
    const projectRoot = path.resolve(process.cwd());
    const cmd = `pnpm tsx scripts/meili-reindex.ts --index=${index}`;

    const child = exec(cmd, { cwd: projectRoot, timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`reindex failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });

    // Ensure the process is killed on timeout
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('reindex timed out after 5 minutes'));
    }, TIMEOUT_MS);

    child.on('close', () => clearTimeout(timer));
  });
}

/** Parse counts from the script's console output (best-effort). */
function parseCounts(output: string): { messages: number; pages: number; blocks: number; users: number } {
  const extract = (label: string): number => {
    const m = output.match(new RegExp(`\\[${label}\\] Done — (\\d+) document`));
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    messages: extract('messages'),
    pages: extract('pages'),
    blocks: extract('blocks'),
    users: extract('users'),
  };
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const authErr = requireCronSecret(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const index = searchParams.get('index') ?? 'all';

  if (!VALID_INDEXES.has(index)) {
    return NextResponse.json(
      { error: `Invalid index "${index}". Use: messages|pages|blocks|users|all` },
      { status: 400 }
    );
  }

  const output = await runReindex(index);
  const indexed = parseCounts(output);

  return NextResponse.json({ indexed });
}

export const GET = handler;
export const POST = handler;
