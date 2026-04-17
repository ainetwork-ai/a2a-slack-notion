/**
 * Canonical collaboration hook — wires a Hocuspocus WebSocket provider to a
 * pooled `Y.Doc` for a given pageId.
 *
 * Invariants (seamless panel ↔ full transitions):
 *   - Same pageId → same pooled `Y.Doc` (via `doc-pool.ts`).
 *   - Same pageId → same `HocuspocusProvider` (via this module's `providerPool`).
 *   - Mounting in both panel and full modes does NOT create duplicate
 *     sockets, duplicate docs, or duplicate awareness state.
 *   - Unmounting does NOT destroy the doc or provider — pool outlives mount
 *     cycles. Tear-down happens via `closeCollaboration(pageId)` on explicit
 *     navigation-away / tab close.
 *
 * Note: `@hocuspocus/provider` and `yjs` are declared in package.json but may
 * not be installed yet. Real types are used throughout — "Cannot find module"
 * errors disappear once `pnpm install` runs.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { getOrCreateDoc } from './doc-pool';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface ActiveUser {
  name: string;
  color: string;
  clientId?: number;
}

export interface UseCollaborationOptions {
  pageId: string;
  /** Display name for awareness. Defaults to `'Anonymous'`. */
  userName?: string;
  /** Override awareness color. Defaults to a deterministic pick from `COLORS`. */
  userColor?: string;
  /** Override the Hocuspocus endpoint. Default: `NEXT_PUBLIC_WS_URL` or `ws://localhost:3002`. */
  url?: string;
  /** Optional token forwarded on the WS auth handshake. */
  token?: string;
}

export interface CollaborationState {
  /** The pooled Y.Doc. Stable for the lifetime of the tab for a given pageId. */
  doc: Y.Doc;
  /** Alias retained for back-compat with editor call-sites that expect `ydoc`. */
  ydoc: Y.Doc;
  /** The pooled Hocuspocus provider. May be `null` briefly before first connect. */
  provider: HocuspocusProvider | null;
  /** Coarse lifecycle state. */
  status: 'connecting' | 'connected' | 'disconnected';
  /** Detailed status that distinguishes reconnect from cold connect. */
  connectionStatus: ConnectionStatus;
  /** True once initial sync with the server has completed. */
  synced: boolean;
  /** Resolved local user (name + awareness color). */
  user: { name: string; color: string };
  /** All users currently active on this doc (including local). */
  activeUsers: ActiveUser[];
}

const COLORS = [
  '#2383e2', '#eb5757', '#448361', '#d9730d', '#9065b0',
  '#c14c8a', '#337ea9', '#cb912f', '#9f6b53', '#787774',
];

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

/** Provider pool — one `HocuspocusProvider` per pageId. */
const providerPool = new Map<string, HocuspocusProvider>();

function getOrCreateProvider(
  pageId: string,
  doc: Y.Doc,
  url: string,
  token: string | undefined,
): HocuspocusProvider {
  let provider = providerPool.get(pageId);
  if (!provider) {
    provider = new HocuspocusProvider({
      url,
      name: pageId,
      document: doc,
      ...(token ? { token } : {}),
    });
    providerPool.set(pageId, provider);
  }
  return provider;
}

export function useCollaboration({
  pageId,
  userName,
  userColor,
  url,
  token,
}: UseCollaborationOptions): CollaborationState {
  const resolvedName = userName ?? 'Anonymous';
  const color = useMemo(
    () => userColor ?? pickColor(resolvedName),
    [userColor, resolvedName],
  );

  // Pooled Y.Doc — same pageId always yields the same doc.
  const doc = useMemo<Y.Doc>(() => {
    return getOrCreateDoc(pageId, () => new Y.Doc()) as Y.Doc;
  }, [pageId]);

  const endpoint =
    url ?? (process.env['NEXT_PUBLIC_WS_URL'] ?? 'ws://localhost:3002');

  // Pooled provider — always resolved synchronously; same pageId → same socket.
  const provider = useMemo<HocuspocusProvider>(
    () => getOrCreateProvider(pageId, doc, endpoint, token),
    [pageId, doc, endpoint, token],
  );

  const [status, setStatus] = useState<CollaborationState['status']>('connecting');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [synced, setSynced] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  useEffect(() => {
    const onSynced = () => {
      setSynced(true);
      setStatus('connected');
      setConnectionStatus('connected');
    };
    const onConnect = () => {
      setStatus('connected');
      setConnectionStatus('connected');
    };
    const onDisconnect = () => {
      setStatus('disconnected');
      setConnectionStatus('disconnected');
    };
    const onClose = () => {
      setStatus('disconnected');
      setConnectionStatus('disconnected');
    };
    const onStatus = ({ status: s }: { status: string }) => {
      if (s === 'connecting') {
        setStatus('connecting');
        setConnectionStatus('reconnecting');
      } else if (s === 'connected') {
        setStatus('connected');
        setConnectionStatus('connected');
      } else if (s === 'disconnected') {
        setStatus('disconnected');
        setConnectionStatus('disconnected');
      }
    };

    provider.on('synced', onSynced);
    provider.on('connect', onConnect);
    provider.on('disconnect', onDisconnect);
    provider.on('close', onClose);
    provider.on('status', onStatus);

    // Awareness — publish local user and track remote users.
    const awareness = provider.awareness;
    let detachAwareness: (() => void) | undefined;
    if (awareness) {
      awareness.setLocalStateField('user', { name: resolvedName, color });

      const recompute = () => {
        const states = awareness.getStates() as Map<number, Record<string, unknown>>;
        const users: ActiveUser[] = [];
        states.forEach((state: Record<string, unknown>, clientId: number) => {
          const u = state['user'] as { name?: string; color?: string } | undefined;
          if (u?.name && u?.color) {
            users.push({ name: u.name, color: u.color, clientId });
          }
        });
        setActiveUsers(users);
      };

      recompute();
      awareness.on('change', recompute);
      detachAwareness = () => awareness.off('change', recompute);
    }

    return () => {
      provider.off('synced', onSynced);
      provider.off('connect', onConnect);
      provider.off('disconnect', onDisconnect);
      provider.off('close', onClose);
      provider.off('status', onStatus);
      detachAwareness?.();
      // INTENTIONAL: do NOT call provider.destroy() here. Pool lifetime
      // outlives React mounts so the panel ↔ full swap does not drop the
      // socket. Use `closeCollaboration(pageId)` on explicit navigation-away.
    };
  }, [provider, resolvedName, color]);

  return {
    doc,
    ydoc: doc,
    provider,
    status,
    connectionStatus,
    synced,
    user: { name: resolvedName, color },
    activeUsers,
  };
}

/** Tear down the pooled provider for `pageId`. Call on explicit navigation-away. */
export function closeCollaboration(pageId: string): void {
  const provider = providerPool.get(pageId);
  if (!provider) return;
  try {
    provider.destroy();
  } catch {
    // disconnect errors on close are expected.
  }
  providerPool.delete(pageId);
}

/** Debug helper. */
export function __providerPoolSize(): number {
  return providerPool.size;
}
