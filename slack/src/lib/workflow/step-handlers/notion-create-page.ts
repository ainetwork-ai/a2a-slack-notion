/**
 * notion_create_page step handler
 *
 * Creates a new page block (type = 'page') inside the blocks table,
 * optionally nested under a parentPageId.  The step returns { pageId }
 * which callers save via the saveAs field.
 */

import { db } from "@/lib/db";
import { blocks } from "@/lib/notion/share-token";
import { eq } from "drizzle-orm";

export interface NotionCreatePageInput {
  workspaceId: string;
  title: string;
  parentPageId?: string;
  blockMarkdown?: string;
  /** The user ID of whoever triggered the workflow (used as createdBy). */
  createdBy: string;
}

export interface NotionCreatePageOutput {
  ok: true;
  pageId: string;
}

export interface NotionCreatePageError {
  ok: false;
  error: string;
}

export async function handleNotionCreatePage(
  input: NotionCreatePageInput
): Promise<NotionCreatePageOutput | NotionCreatePageError> {
  try {
    const { workspaceId, title, parentPageId, blockMarkdown, createdBy } = input;

    // Insert the page block; pageId self-references its own id (set after insert)
    const [page] = await db
      .insert(blocks)
      .values({
        type: "page",
        parentId: parentPageId ?? null,
        // pageId is the page's own id — we patch it below via update
        pageId: "00000000-0000-0000-0000-000000000000", // placeholder, updated below
        workspaceId,
        properties: { title },
        content: blockMarkdown ? { markdown: blockMarkdown } : {},
        childrenOrder: [],
        createdBy,
      })
      .returning();

    if (!page) {
      return { ok: false, error: "Failed to insert page block" };
    }

    // Update pageId to self-reference (page blocks are their own page root)
    await db
      .update(blocks)
      .set({ pageId: page.id })
      .where(eq(blocks.id, page.id));

    return { ok: true, pageId: page.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
