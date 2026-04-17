/**
 * Thin wrapper around `chrome.storage.sync` so settings roam across
 * the user's signed-in browsers. Falls back to `chrome.storage.local`
 * when sync is not available (e.g. enterprise profiles with sync off).
 */

import { DEFAULT_SETTINGS, type ClipperSettings } from './types';

const STORAGE_KEYS: (keyof ClipperSettings)[] = [
  'baseUrl',
  'apiKey',
  'workspaceId',
];

function area(): chrome.storage.StorageArea {
  // chrome.storage.sync is generally preferred; fall back if disabled
  return chrome.storage?.sync ?? chrome.storage.local;
}

export async function getSettings(): Promise<ClipperSettings> {
  const raw = await area().get(STORAGE_KEYS);
  return {
    baseUrl:
      typeof raw.baseUrl === 'string' && raw.baseUrl.trim() !== ''
        ? raw.baseUrl.trim()
        : DEFAULT_SETTINGS.baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : DEFAULT_SETTINGS.apiKey,
    workspaceId:
      typeof raw.workspaceId === 'string'
        ? raw.workspaceId
        : DEFAULT_SETTINGS.workspaceId,
  };
}

export async function setSettings(
  patch: Partial<ClipperSettings>,
): Promise<void> {
  const sanitized: Record<string, string> = {};
  if (typeof patch.baseUrl === 'string') {
    sanitized.baseUrl = patch.baseUrl.trim();
  }
  if (typeof patch.apiKey === 'string') {
    sanitized.apiKey = patch.apiKey.trim();
  }
  if (typeof patch.workspaceId === 'string') {
    sanitized.workspaceId = patch.workspaceId.trim();
  }
  await area().set(sanitized);
}
