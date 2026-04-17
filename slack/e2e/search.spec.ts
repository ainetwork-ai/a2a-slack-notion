/**
 * Meilisearch indexing + search.
 *
 * Flow:
 *   1. Seed a channel + user membership (via DB) so the messages POST works.
 *   2. POST a message with a unique token.
 *   3. Poll GET /api/search/v2?q=<token>&workspaceId=<id> with retries until
 *      the hit appears or the deadline passes.
 *   4. Verify the same token does NOT appear when filtering by a different
 *      workspaceId — confirming the workspace filter.
 */

import { randomBytes } from "node:crypto";
import { buildSessionCookie, createTestUser, createTestWorkspace, deleteUser, deleteWorkspace, expect, test } from "./fixtures";

// Match the hermetic-state rule: no shared state; every test seeds its own.

async function pollSearch(
  request: import("@playwright/test").APIRequestContext,
  headers: Record<string, string>,
  q: string,
  workspaceId: string,
  deadlineMs = 10_000,
): Promise<{ hits: { messages: Array<{ content?: string }> } }> {
  const started = Date.now();
  let last: unknown = null;
  while (Date.now() - started < deadlineMs) {
    const res = await request.get(
      `/api/search/v2?q=${encodeURIComponent(q)}&workspaceId=${workspaceId}&scope=messages`,
      { headers },
    );
    if (res.ok()) {
      const body = (await res.json()) as { hits: { messages: Array<{ content?: string }> } };
      last = body;
      if (body.hits.messages.length > 0) return body;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Search never returned a hit for q=${q}. Last payload: ${JSON.stringify(last)}`);
}

test.describe("Meilisearch v2 — message search", () => {
  test("POSTed message becomes searchable within ~1s", async ({ request, seed }) => {
    const cookie = await buildSessionCookie(seed.user.id);
    const headers = { Cookie: `${cookie.name}=${cookie.value}` };

    // Seed a channel inside the workspace. Messages require a channelId OR conversationId.
    // We hit the REST endpoint rather than direct DB so triggers (Meili indexers) fire.
    const channelRes = await request.post("/api/channels", {
      headers,
      data: {
        workspaceId: seed.workspace.id,
        name: `search-${Date.now().toString(36)}`,
        description: "search spec channel",
      },
    });
    expect(channelRes.status(), await channelRes.text()).toBeLessThan(300);
    const channel = await channelRes.json();
    const channelId: string = channel.id ?? channel.channel?.id;
    expect(channelId).toBeTruthy();

    const token = `e2e-search-${randomBytes(4).toString("hex")}`;

    const postRes = await request.post("/api/messages", {
      headers,
      data: { channelId, content: `hello ${token} world` },
    });
    expect(postRes.status(), await postRes.text()).toBeLessThan(300);

    const body = await pollSearch(request, headers, token, seed.workspace.id);
    expect(body.hits.messages.length).toBeGreaterThan(0);
    expect(body.hits.messages.some((m) => (m.content ?? "").includes(token))).toBe(true);
  });

  test("search filters by workspaceId — token in ws A does NOT leak into ws B", async ({
    request,
    seed,
  }) => {
    const cookie = await buildSessionCookie(seed.user.id);
    const headers = { Cookie: `${cookie.name}=${cookie.value}` };

    // ws A: seed + post message
    const channelRes = await request.post("/api/channels", {
      headers,
      data: { workspaceId: seed.workspace.id, name: `iso-${Date.now().toString(36)}` },
    });
    const channel = await channelRes.json();
    const channelId: string = channel.id ?? channel.channel?.id;

    const token = `e2e-iso-${randomBytes(4).toString("hex")}`;
    await request.post("/api/messages", {
      headers,
      data: { channelId, content: `isolated ${token}` },
    });

    // Wait for indexing in ws A.
    await pollSearch(request, headers, token, seed.workspace.id);

    // ws B: different user + workspace. Token should not appear in ws B's results.
    const otherUser = await createTestUser({ displayName: "Other WS E2E" });
    const otherWs = await createTestWorkspace(otherUser.id);
    try {
      const otherCookie = await buildSessionCookie(otherUser.id);
      const otherHeaders = { Cookie: `${otherCookie.name}=${otherCookie.value}` };
      const res = await request.get(
        `/api/search/v2?q=${encodeURIComponent(token)}&workspaceId=${otherWs.id}&scope=messages`,
        { headers: otherHeaders },
      );
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { hits: { messages: Array<{ content?: string }> } };
      expect(body.hits.messages.some((m) => (m.content ?? "").includes(token))).toBe(false);
    } finally {
      await deleteWorkspace(otherWs.id);
      await deleteUser(otherUser.id);
    }
  });
});
