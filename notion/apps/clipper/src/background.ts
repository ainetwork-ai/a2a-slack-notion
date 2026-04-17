/**
 * MV3 service worker — orchestrates clip flow across the extension.
 *
 * MV3 constraints we respect:
 *   - Service workers are ephemeral; DO NOT store state in module
 *     scope. Persist via `chrome.storage`.
 *   - `chrome.scripting.executeScript` is the only way to grab page
 *     content; `activeTab` permission + an explicit user action
 *     (popup click or context-menu click) is enough — no
 *     `<all_urls>` content-script injection.
 *   - Imports must be static ES modules (manifest `type: "module"`).
 */

import { clip } from './api';
import { extract } from './content';
import { getSettings } from './storage';
import type { BgRequest, BgResponse, ExtractedPage } from './types';

const CONTEXT_MENU_ID = 'slack-notion-clipper-clip';

// ── Install: register the context menu ───────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Clip to Notion',
    contexts: ['page', 'selection', 'link'],
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function extractFromTab(tabId: number): Promise<ExtractedPage> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    // extract() is bundled into content.js, but when invoked inline like
    // this the function source is serialised and re-evaluated in the
    // tab's world — so it MUST be self-contained.
    func: extract,
  });
  const payload = result?.result as ExtractedPage | undefined;
  if (!payload) {
    throw new Error('Failed to extract page content.');
  }
  return payload;
}

async function clipTab(
  tabId: number,
  opts: { useSelectionOnly?: boolean } = {},
): Promise<{ pageId: string; pageUrl: string }> {
  const settings = await getSettings();
  const extracted = await extractFromTab(tabId);

  // If the menu was triggered on a selection, drop paragraphs so the
  // selection alone becomes the body. Otherwise keep both.
  const payload: ExtractedPage = opts.useSelectionOnly
    ? { ...extracted, paragraphs: [] }
    : extracted;

  return clip(settings, payload);
}

// Notify the active tab with a lightweight toast via the popup, or fall
// back to a chrome notification.
async function notify(title: string, message: string): Promise<void> {
  try {
    await chrome.notifications?.create?.({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon48.png'),
      title,
      message,
    });
  } catch {
    // notifications permission not granted — silently ignore
  }
}

// ── Context menu click ───────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (!tab?.id) return;
  try {
    const useSelectionOnly = Boolean(info.selectionText);
    const { pageUrl } = await clipTab(tab.id, { useSelectionOnly });
    await notify('Clipped to Notion', pageUrl);
  } catch (err) {
    await notify(
      'Clip failed',
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
});

// ── Popup / other surfaces message handler ──────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
    (async () => {
      try {
        if (msg.type === 'get-settings') {
          const s = await getSettings();
          // Surface only what the popup needs; keep the shape of
          // BgResponse honest by pretending this is a "clip" OK so
          // the discriminated union still holds — the popup uses
          // `get-settings` via a direct storage read anyway.
          sendResponse({ ok: true, pageId: s.workspaceId, pageUrl: s.baseUrl });
          return;
        }
        if (msg.type === 'clip-active-tab') {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (!tab?.id) {
            sendResponse({ ok: false, error: 'No active tab.' });
            return;
          }
          const { pageId, pageUrl } = await clipTab(tab.id, {
            useSelectionOnly: msg.useSelectionOnly,
          });
          sendResponse({ ok: true, pageId, pageUrl });
          return;
        }
        sendResponse({ ok: false, error: 'Unknown message type.' });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    // Return true to keep the message channel open for the async
    // sendResponse call.
    return true;
  },
);
