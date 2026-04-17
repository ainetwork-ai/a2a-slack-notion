/**
 * notion_notify step handler
 *
 * Enqueues Notion-style notifications for one or more users.
 * userIds is a comma-separated string or a JSON array string
 * (either format is accepted so template authors can pass {{someList}}).
 */

import { createNotionNotification } from "@/lib/notion/create-notification";

export interface NotionNotifyInput {
  pageId: string;
  /** Comma-separated user IDs or JSON array string of user IDs. */
  userIds: string;
  title: string;
  body?: string;
}

export interface NotionNotifyOutput {
  ok: true;
  notified: number;
}

export interface NotionNotifyError {
  ok: false;
  error: string;
}

function parseUserIds(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fall through to comma split
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function handleNotionNotify(
  input: NotionNotifyInput
): Promise<NotionNotifyOutput | NotionNotifyError> {
  try {
    const { pageId, userIds, title, body } = input;

    const ids = parseUserIds(userIds);
    if (ids.length === 0) {
      return { ok: false, error: "No userIds provided to notion_notify" };
    }

    const unique = [...new Set(ids)];

    await Promise.all(
      unique.map((userId) =>
        createNotionNotification({
          userId,
          type: "page_update",
          title,
          body,
          pageId,
        })
      )
    );

    return { ok: true, notified: unique.length };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
