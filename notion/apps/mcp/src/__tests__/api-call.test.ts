import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiCall } from '../tools.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  process.env['NOTION_API_URL'] = 'http://localhost:3001';
  process.env['NOTION_API_KEY'] = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('T5: apiCall()', () => {
  it('normal JSON response → returns parsed data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: '123', name: 'Test Page' }),
    } as Response);

    const result = await apiCall('GET', '/pages/123');
    expect(result).toEqual({ id: '123', name: 'Test Page' });
  });

  it('non-OK response → throws with status message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response);

    await expect(apiCall('GET', '/pages/nonexistent')).rejects.toThrow(
      'API GET /pages/nonexistent failed 404',
    );
  });

  it('text/non-JSON response → returned as string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'plain text response',
    } as Response);

    const result = await apiCall('GET', '/ping');
    expect(result).toBe('plain text response');
  });

  it('passes AbortSignal.timeout to fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '{}',
    } as Response);

    await apiCall('GET', '/test');

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toHaveProperty('signal');
  });
});
