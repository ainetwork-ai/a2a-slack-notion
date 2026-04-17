/**
 * Options / settings page — lets the user configure where to POST
 * their clips. Stored via `chrome.storage.sync` so they roam across
 * browsers signed into the same profile.
 */

import { getSettings, setSettings } from './storage';

function $(id: string): HTMLInputElement | HTMLButtonElement | HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in options.html`);
  return el;
}

function showMessage(kind: 'ok' | 'err', text: string): void {
  const msg = $('message');
  msg.className = `message message--${kind}`;
  msg.textContent = text;
  window.setTimeout(() => {
    msg.className = 'message';
    msg.textContent = '';
  }, 2500);
}

async function hydrate(): Promise<void> {
  const s = await getSettings();
  ($('baseUrl') as HTMLInputElement).value = s.baseUrl;
  ($('apiKey') as HTMLInputElement).value = s.apiKey;
  ($('workspaceId') as HTMLInputElement).value = s.workspaceId;
}

async function onSave(): Promise<void> {
  const baseUrl = ($('baseUrl') as HTMLInputElement).value.trim();
  const apiKey = ($('apiKey') as HTMLInputElement).value.trim();
  const workspaceId = ($('workspaceId') as HTMLInputElement).value.trim();

  if (!/^https?:\/\//i.test(baseUrl)) {
    showMessage('err', 'API base URL must start with http:// or https://');
    return;
  }
  if (!workspaceId) {
    showMessage('err', 'Workspace ID is required.');
    return;
  }

  try {
    await setSettings({ baseUrl, apiKey, workspaceId });
    showMessage('ok', 'Saved.');
  } catch (err) {
    showMessage('err', err instanceof Error ? err.message : 'Save failed.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void hydrate();
  ($('save') as HTMLButtonElement).addEventListener('click', () => {
    void onSave();
  });
});
