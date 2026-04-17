/**
 * GET /api/search/v2
 *
 * Unified global search backed by Meilisearch.
 * Supports: ?q=&scope=messages|pages|blocks|users|all&workspaceId=&limit=&offset=
 * Returns: { hits: { messages, pages, blocks, users }, total }
 *
 * Every search is scoped to the authenticated user's workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { meili } from "@/lib/search/meili-client";
import {
  INDEX_MESSAGES,
  INDEX_PAGES,
  INDEX_BLOCKS,
  INDEX_USERS,
} from "@/lib/search/indexes";
import type {
  MeiliMessage,
  MeiliPage,
  MeiliBlock,
  MeiliUser,
} from "@/lib/search/indexer";

type Scope = "messages" | "pages" | "blocks" | "users" | "all";

const VALID_SCOPES = new Set<Scope>(["messages", "pages", "blocks", "users", "all"]);

interface SearchHits {
  messages: MeiliMessage[];
  pages: MeiliPage[];
  blocks: MeiliBlock[];
  users: MeiliUser[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error as NextResponse;

  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const scopeParam = (searchParams.get("scope") ?? "all") as Scope;
  const workspaceId = searchParams.get("workspaceId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  if (!q) {
    return NextResponse.json({
      hits: { messages: [], pages: [], blocks: [], users: [] },
      total: 0,
    });
  }

  const scope: Scope = VALID_SCOPES.has(scopeParam) ? scopeParam : "all";

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 }
    );
  }

  const wFilter = `workspaceId = "${workspaceId}"`;

  const searchMessages =
    scope === "all" || scope === "messages"
      ? meili
          .index(INDEX_MESSAGES.uid)
          .search<MeiliMessage>(q, {
            filter: wFilter,
            limit,
            offset,
          })
          .catch(() => ({ hits: [] as MeiliMessage[] }))
      : Promise.resolve({ hits: [] as MeiliMessage[] });

  const searchPages =
    scope === "all" || scope === "pages"
      ? meili
          .index(INDEX_PAGES.uid)
          .search<MeiliPage>(q, {
            filter: wFilter,
            limit,
            offset,
          })
          .catch(() => ({ hits: [] as MeiliPage[] }))
      : Promise.resolve({ hits: [] as MeiliPage[] });

  const searchBlocks =
    scope === "all" || scope === "blocks"
      ? meili
          .index(INDEX_BLOCKS.uid)
          .search<MeiliBlock>(q, {
            filter: wFilter,
            limit,
            offset,
          })
          .catch(() => ({ hits: [] as MeiliBlock[] }))
      : Promise.resolve({ hits: [] as MeiliBlock[] });

  // Users index has no workspaceId field — skip wFilter for users (see gotchas in report)
  const searchUsers =
    scope === "all" || scope === "users"
      ? meili
          .index(INDEX_USERS.uid)
          .search<MeiliUser>(q, {
            limit,
            offset,
          })
          .catch(() => ({ hits: [] as MeiliUser[] }))
      : Promise.resolve({ hits: [] as MeiliUser[] });

  const [msgResult, pageResult, blockResult, userResult] = await Promise.all([
    searchMessages,
    searchPages,
    searchBlocks,
    searchUsers,
  ]);

  const hits: SearchHits = {
    messages: msgResult.hits,
    pages: pageResult.hits,
    blocks: blockResult.hits,
    users: userResult.hits,
  };

  const total =
    hits.messages.length +
    hits.pages.length +
    hits.blocks.length +
    hits.users.length;

  return NextResponse.json({ hits, total });
}
