// ---------------------------------------------------------------------------
// Notion Clone Clipper — popup.js
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const apiUrlInput    = $('apiUrl');
const apiKeyInput    = $('apiKey');
const workspaceInput = $('workspaceId');
const saveBtn        = $('saveSettings');
const clipPageBtn    = $('clipPage');
const clipSelectBtn  = $('clipSelection');
const statusEl       = $('status');

// ── Load saved settings ──────────────────────────────────────────────────────

chrome.storage.local.get(['apiUrl', 'apiKey', 'workspaceId'], (data) => {
  if (data.apiUrl)      apiUrlInput.value    = data.apiUrl;
  if (data.apiKey)      apiKeyInput.value    = data.apiKey;
  if (data.workspaceId) workspaceInput.value = data.workspaceId;
});

// ── Save settings ────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    apiUrl:      apiUrlInput.value.trim(),
    apiKey:      apiKeyInput.value.trim(),
    workspaceId: workspaceInput.value.trim(),
  }, () => {
    showStatus('Settings saved.', 'success');
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function setLoading(loading) {
  clipPageBtn.disabled    = loading;
  clipSelectBtn.disabled  = loading;
}

function getSettings() {
  return {
    apiUrl:      apiUrlInput.value.trim() || 'http://localhost:3001',
    apiKey:      apiKeyInput.value.trim(),
    workspaceId: workspaceInput.value.trim(),
  };
}

/**
 * POST a new page to the API with one child block.
 * @param {string} title       - Page title
 * @param {string} url         - Source URL (bookmark block) or null
 * @param {string} bodyText    - Selected text (text block) or null
 */
async function createClippedPage(title, url, bodyText) {
  const { apiUrl, apiKey, workspaceId } = getSettings();

  if (!workspaceId) {
    showStatus('Please set Workspace ID in settings.', 'error');
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // 1. Create the page
  const pageRes = await fetch(
    `${apiUrl}/api/v1/pages?workspace_id=${encodeURIComponent(workspaceId)}`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ title }),
    },
  );

  if (!pageRes.ok) {
    const err = await pageRes.json().catch(() => ({}));
    throw new Error(err.message || `API error ${pageRes.status}`);
  }

  const page = await pageRes.json();
  const pageId = page.id;

  // 2. Create child block
  let blockType;
  let properties;
  let content;

  if (url && !bodyText) {
    // Bookmark block
    blockType  = 'bookmark';
    properties = { url, title };
    content    = {};
  } else {
    // Text block with selection
    blockType  = 'text';
    properties = {};
    content    = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: bodyText || '' }],
        },
      ],
    };
  }

  await fetch(`${apiUrl}/api/v1/blocks`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ pageId, type: blockType, properties, content }),
  });

  return pageId;
}

// ── Clip Page (title + URL as bookmark) ──────────────────────────────────────

clipPageBtn.addEventListener('click', async () => {
  setLoading(true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const title = tab.title || tab.url || 'Clipped Page';
    const url   = tab.url  || '';

    await createClippedPage(title, url, null);
    showStatus('Page clipped successfully!', 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
});

// ── Clip Selection (selected text as text block) ──────────────────────────────

clipSelectBtn.addEventListener('click', async () => {
  setLoading(true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject script to get selected text
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });

    const selectedText = results?.[0]?.result ?? '';
    if (!selectedText.trim()) {
      showStatus('No text selected on the page.', 'error');
      return;
    }

    const title = `Selection from: ${tab.title || tab.url || 'Unknown page'}`;
    await createClippedPage(title, null, selectedText);
    showStatus('Selection clipped successfully!', 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
});
