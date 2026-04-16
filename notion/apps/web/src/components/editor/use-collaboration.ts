'use client';

import { useMemo, useEffect, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

interface UseCollaborationOptions {
  pageId: string;
  userName: string;
  userColor?: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface ActiveUser {
  name: string;
  color: string;
}

const COLORS = [
  '#2383e2', '#eb5757', '#448361', '#d9730d', '#9065b0',
  '#c14c8a', '#337ea9', '#cb912f', '#9f6b53', '#787774',
];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]!;
}

export function useCollaboration({ pageId, userName, userColor }: UseCollaborationOptions) {
  const [synced, setSynced] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  const color = useMemo(() => userColor ?? randomColor(), [userColor]);

  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const wsUrl = process.env['NEXT_PUBLIC_WS_URL'] ?? 'ws://localhost:3012';

    const prov = new HocuspocusProvider({
      url: wsUrl,
      name: pageId,
      document: doc,
      token: 'session', // TODO: Pass actual session token
    });

    return { ydoc: doc, provider: prov };
  }, [pageId]);

  // Fallback: mark editor as ready after 3s even if WebSocket never connects,
  // so users can edit offline without being blocked by "Connecting..." forever.
  useEffect(() => {
    const fallback = setTimeout(() => setSynced(true), 3000);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    const handleSynced = () => {
      setSynced(true);
      setConnectionStatus('connected');
    };

    const handleConnect = () => {
      setConnectionStatus('connected');
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    const handleClose = () => {
      setConnectionStatus('disconnected');
    };

    const handleStatus = ({ status }: { status: string }) => {
      if (status === 'connecting') {
        setConnectionStatus('reconnecting');
      } else if (status === 'connected') {
        setConnectionStatus('connected');
      } else if (status === 'disconnected') {
        setConnectionStatus('disconnected');
      }
    };

    provider.on('synced', handleSynced);
    provider.on('connect', handleConnect);
    provider.on('disconnect', handleDisconnect);
    provider.on('close', handleClose);
    provider.on('status', handleStatus);

    // Set up awareness for active users
    const awareness = provider.awareness;

    if (awareness) {
      // Set local user state
      awareness.setLocalStateField('user', { name: userName, color });

      const updateActiveUsers = () => {
        const states = awareness.getStates();
        const users: ActiveUser[] = [];
        states.forEach((state: Record<string, unknown>) => {
          const user = state['user'] as { name?: string; color?: string } | undefined;
          if (user?.name && user?.color) {
            users.push({ name: user.name, color: user.color });
          }
        });
        setActiveUsers(users);
      };

      updateActiveUsers();
      awareness.on('change', updateActiveUsers);

      return () => {
        provider.off('synced', handleSynced);
        provider.off('connect', handleConnect);
        provider.off('disconnect', handleDisconnect);
        provider.off('close', handleClose);
        provider.off('status', handleStatus);
        awareness.off('change', updateActiveUsers);
        provider.destroy();
      };
    }

    return () => {
      provider.off('synced', handleSynced);
      provider.off('connect', handleConnect);
      provider.off('disconnect', handleDisconnect);
      provider.off('close', handleClose);
      provider.off('status', handleStatus);
      provider.destroy();
    };
  }, [provider, userName, color]);

  return {
    ydoc,
    provider,
    synced,
    user: { name: userName, color },
    connectionStatus,
    activeUsers,
  };
}
