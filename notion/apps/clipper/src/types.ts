/**
 * Shared types across background / popup / options / content scripts.
 *
 * Keep this file dependency-free so it can be imported from any surface.
 */

export interface ClipperSettings {
  baseUrl: string;
  apiKey: string;
  workspaceId: string;
}

export const DEFAULT_SETTINGS: ClipperSettings = {
  baseUrl: 'http://localhost:3000',
  apiKey: '',
  workspaceId: '',
};

/** Metadata extracted from the page by the content script. */
export interface ExtractedPage {
  title: string;
  url: string;
  selection: string;
  /** Heuristic main-content paragraphs, plain-text. */
  paragraphs: string[];
  /** og:image if present. */
  image?: string;
  /** og:description or <meta name="description"> if present. */
  description?: string;
  /** emoji or favicon URL — used as page icon. */
  icon?: string;
}

/** Messages sent to the background service worker. */
export type BgRequest =
  | { type: 'clip-active-tab'; useSelectionOnly?: boolean }
  | { type: 'get-settings' };

export type BgResponse =
  | { ok: true; pageId: string; pageUrl: string }
  | { ok: false; error: string };

/** Shape of the clip call sent to the slack server (two-call flow). */
export interface CreatePageBody {
  workspaceId: string;
  title: string;
  icon?: string;
  properties: {
    topic?: string;
    source?: string;
    description?: string;
  };
}

export interface CreateBlockBody {
  type: 'text';
  content: { text: string };
}
