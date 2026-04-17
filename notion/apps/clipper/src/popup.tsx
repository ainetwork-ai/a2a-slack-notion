/**
 * Popup UI — vanilla TS (no React dependency), but the `.tsx`
 * extension is kept so a future migration to a UI framework
 * doesn't require renaming entry points.
 *
 * Shows a single "Clip this page" button, a settings link, and
 * a result panel with either an error or a link to the created
 * page.
 */

import type { BgRequest, BgResponse } from './types';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in popup.html`);
  return el;
}

function setStatus(
  kind: 'idle' | 'loading' | 'success' | 'error',
  message: string,
  link?: string,
): void {
  const status = $('status');
  status.className = `status status--${kind}`;
  if (link) {
    status.innerHTML = '';
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = message;
    status.appendChild(a);
  } else {
    status.textContent = message;
  }
}

async function sendBg(req: BgRequest): Promise<BgResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(req, (res: BgResponse) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'bg error' });
        return;
      }
      resolve(res);
    });
  });
}

async function onClipClick(): Promise<void> {
  setStatus('loading', 'Clipping…');
  const btn = $('clip') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const res = await sendBg({ type: 'clip-active-tab' });
    if (res.ok) {
      setStatus('success', 'Opened in Notion', res.pageUrl);
    } else {
      setStatus('error', res.error);
    }
  } finally {
    btn.disabled = false;
  }
}

function onOptionsClick(e: Event): void {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

document.addEventListener('DOMContentLoaded', () => {
  $('clip').addEventListener('click', () => {
    void onClipClick();
  });
  $('open-options').addEventListener('click', onOptionsClick);
  setStatus('idle', '');
});
