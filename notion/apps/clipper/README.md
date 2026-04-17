# @notion/clipper

Chromium/Edge/Firefox (MV3-compatible) browser extension that clips the
current web page into a [slack-a2a Notion workspace](../../../slack/).
Works with the context menu ("Clip to Notion") or the toolbar popup.

## Quick start

```bash
pnpm install
pnpm --filter @notion/clipper build       # one-shot build → dist/
pnpm --filter @notion/clipper dev         # rebuild on change
```

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on
3. Click **Load unpacked** and select `notion/apps/clipper/dist/`
4. Pin the extension from the puzzle-piece menu

## Configure

Click the extension icon → **Settings** (or `chrome://extensions` →
**Details** → **Extension options**). Fill in:

| Field | What it is |
|---|---|
| API base URL | Where your slack-a2a server is running. Defaults to `http://localhost:3000`. |
| API key | Generate one in your slack-a2a profile at `/settings`. Paste it here — stored via `chrome.storage.sync`, never logged. |
| Target workspace ID | The workspace that should own the clipped pages. You can copy it from the URL in the web app. |

## How it works

- **Popup**: one-click "Clip this page" button. Extracts title + URL + main content + any text selection and sends it to the API.
- **Context menu**: right-click anywhere on a page → *Clip to Notion*. Right-clicking while text is selected clips only the selection.
- **Readability heuristic**: picks the largest `<article>`, `<main>`, or `[role="main"]` container and walks the DOM, skipping `<nav>`, `<footer>`, `<aside>`, `<script>`, `<style>`, `<iframe>`, `<form>`, `<header>`, and `<button>`. Falls back to `<body>`.

The extension makes two API calls per clip:

```
POST ${baseUrl}/api/pages
  { workspaceId, title, icon?, properties: { source, description, topic } }
→ { id }

POST ${baseUrl}/api/pages/:id/blocks      (× N, one per paragraph)
  { type: 'text', content: { text } }
```

## Privacy

The extension **only sends content when you explicitly clip**. No
background telemetry, no ad networks, no third-party scripts, no remote
code. The only network request made by the extension is the pair of
POSTs above, to the API base URL you configured.

Host permission `<all_urls>` is requested so the popup and context menu
can operate on any page — the extension never reads pages in the
background; injection happens only after a user gesture (popup click or
menu click), under the MV3 `activeTab` permission.

## Known limitations / TODOs

- **Readability is heuristic**, not Mozilla Readability. Works well on
  most blog posts and news sites; can miss or include extra text on
  SPA-heavy pages (Twitter, Reddit, etc.). Swap in
  `@mozilla/readability` for stronger extraction.
- **Images are not uploaded.** We capture `og:image` as a URL in the
  page properties, but image blocks aren't created. Follow-up: add an
  image-block path that uploads via `/api/upload`.
- **No pagination of blocks.** Capped at 50 paragraphs per clip to
  avoid hammering the API.
- **No single-shot `/api/clip` endpoint.** The client does two HTTP
  calls instead (see scope note in the code).
- **Firefox MV3**: manifest is portable, but Firefox's service-worker
  equivalent needs a `background.scripts` fallback — untested.
- **Icons**: `icon16.png` / `icon48.png` carried over from the prior
  stub. Replace with proper branding before publishing.

## File layout

```
notion/apps/clipper/
├── manifest.json         MV3 manifest
├── package.json          @notion/clipper workspace package
├── tsconfig.json         DOM + ES2022
├── vite.config.ts        Multi-entry MV3 build
├── popup.html            Popup shell (loads popup.js)
├── options.html          Settings page shell (loads options.js)
├── icon16.png            (carried over from previous stub)
├── icon48.png
├── src/
│   ├── background.ts     Service worker: context menu + message router
│   ├── popup.tsx         Popup controller
│   ├── options.tsx       Settings controller
│   ├── content.ts        DOM extraction (injected via executeScript)
│   ├── api.ts            HTTP client for slack-a2a Notion API
│   ├── storage.ts        chrome.storage.sync wrapper
│   └── types.ts          Shared message / settings types
└── README.md             this file
```
