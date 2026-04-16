import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma BEFORE importing the middleware
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
  },
}));

import {
  demoModeMiddleware,
  checkDemoModeProductionGuard,
  _resetDemoUserCache,
} from '../middleware/demo-mode.js';
import { prisma } from '../lib/prisma.js';

const mockUpsert = vi.mocked(prisma.user.upsert);

const DEMO_USER = {
  id: 'demo-id',
  walletAddress: '0x000000000000000000000000000000000000DEMO',
  name: 'Demo User',
  image: null,
  createdAt: new Date(),
};

function makeContext() {
  const store: Record<string, unknown> = {};
  return {
    req: { header: () => null },
    set: (key: string, val: unknown) => {
      store[key] = val;
    },
    get: (key: string) => store[key],
    _store: store,
  } as unknown as Parameters<typeof demoModeMiddleware>[0] & {
    _store: Record<string, unknown>;
  };
}

describe('T1: DEMO_MODE middleware', () => {
  beforeEach(() => {
    _resetDemoUserCache();
    mockUpsert.mockResolvedValue(DEMO_USER as any);
  });

  afterEach(() => {
    delete process.env['DEMO_MODE'];
    delete process.env['NODE_ENV'];
    vi.clearAllMocks();
  });

  it('DEMO_MODE=true → injects demo user and calls next', async () => {
    process.env['DEMO_MODE'] = 'true';
    const ctx = makeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await demoModeMiddleware(ctx, next);

    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(ctx._store['user']).toEqual(DEMO_USER);
    expect(next).toHaveBeenCalledOnce();
  });

  it('DEMO_MODE=true → caches demo user (upsert called only once)', async () => {
    process.env['DEMO_MODE'] = 'true';
    const ctx1 = makeContext();
    const ctx2 = makeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await demoModeMiddleware(ctx1, next);
    await demoModeMiddleware(ctx2, next);

    // upsert called only once due to caching
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(ctx2._store['user']).toEqual(DEMO_USER);
  });

  it('DEMO_MODE=false → falls through to next without injecting user', async () => {
    process.env['DEMO_MODE'] = 'false';
    const ctx = makeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await demoModeMiddleware(ctx, next);

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(ctx._store['user']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('DEMO_MODE unset → falls through to next without injecting user', async () => {
    delete process.env['DEMO_MODE'];
    const ctx = makeContext();
    const next = vi.fn().mockResolvedValue(undefined);

    await demoModeMiddleware(ctx, next);

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(ctx._store['user']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('NODE_ENV=production + DEMO_MODE=true → checkDemoModeProductionGuard throws', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DEMO_MODE'] = 'true';

    expect(() => checkDemoModeProductionGuard()).toThrow(
      'DEMO_MODE=true is not allowed in production',
    );
  });

  it('NODE_ENV=development + DEMO_MODE=true → guard does not throw', () => {
    process.env['NODE_ENV'] = 'development';
    process.env['DEMO_MODE'] = 'true';

    expect(() => checkDemoModeProductionGuard()).not.toThrow();
  });
});
