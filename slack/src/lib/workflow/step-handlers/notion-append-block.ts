/**
 * notion_append_block step handler
 *
 * Appends a child block to an existing page block, then updates the
 * parent's childrenOrder array.  Returns { blockId }.
 */

import { db } from "@/lib/db";
import { blocks } from "@/lib/notion/share-token";
import type { BlockType } from "@/lib/notion/share-token";
import { eq, sql } from "drizzle-orm";

export interface NotionAppendBlockInput {
  pageId: string;
  blockType: string;
  content: string;
  properties?: Record<string, unknown>;
  /** The user ID of whoever triggered the workflow (used as createdBy). */
  createdBy: string;
}

export interface NotionAppendBlockOutput {
  ok: true;
  blockId: string;
}

export interface NotionAppendBlockError {
  ok: false;
  error: string;
}

export async function handleNotionAppendBlock(
  input: NotionAppendBlockInput
): Promise<NotionAppendBlockOutput | NotionAppendBlockError> {
  try {
    const { pageId, blockType, content, properties = {}, createdBy } = input;

    // Fetch the parent page to validate it exists and get workspaceId
    const [parentPage] = await db
      .select({ workspaceId: blocks.workspaceId, childrenOrder: blocks.childrenOrder })
      .from(blocks)
      .where(eq(blocks.id, pageId))
      .limit(1);

    if (!parentPage) {
      return { ok: false, error: `Page not found: "${pageId}"` };
    }

    // Insert child block
    const [child] = await db
      .insert(blocks)
      .values({
        type: blockType as BlockType,
        parentId: pageId,
        pageId,
        workspaceId: parentPage.workspaceId,
        properties: { ...properties, text: content },
        content: { text: content },
        childrenOrder: [],
        createdBy,
      })
      .returning();

    if (!child) {
      return { ok: false, error: "Failed to insert block" };
    }

    // Append child id to parent's childrenOrder
    await db.execute(
      sql`
        UPDATE blocks
        SET children_order = children_order || ${JSON.stringify([child.id])}::jsonb,
            updated_at = NOW()
        WHERE id = ${pageId}
      `
    );

    return { ok: true, blockId: child.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
