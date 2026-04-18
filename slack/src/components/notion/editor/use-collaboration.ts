'use client';

import { useMemo, useEffect, useState, useRef } from 'react';
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

  // ydoc is stable per pageId — ref ensures it isn't recreated on StrictMode double-render
  const ydocRef = useRef<Y.Doc | null>(null);
  const pageIdRef = useRef<string | null>(null);
  if (pageIdRef.current !== pageId) {
    ydocRef.current = new Y.Doc();
    pageIdRef.current = pageId;
  }
  const ydoc = ydocRef.current!;

  // Fallback: mark editor as ready after 3s even if WebSocket never connects,
  // so users can edit offline without being blocked by "Connecting..." forever.
  useEffect(() => {
    const fallback = setTimeout(() => setSynced(true), 3000);
    return () => clearTimeout(fallback);
  }, []);

  // Provider is created inside useEffect so React StrictMode's double-invoke
  // (mount → cleanup → mount) properly destroys and recreates it instead of
  // leaving a dead provider with listeners attached.
  useEffect(() => {
    setSynced(false);
    setConnectionStatus('disconnected');

    const wsUrl = process.env['NEXT_PUBLIC_WS_URL'] ?? 'ws://localhost:3002';
    const prov = new HocuspocusProvider({
      url: wsUrl,
      name: pageId,
      document: ydoc,
      token: 'session',
    });

    const handleSynced = () => {
      setSynced(true);
      setConnectionStatus('connected');
    };
    const handleConnect = () => setConnectionStatus('connected');
    const handleDisconnect = () => setConnectionStatus('disconnected');
    const handleClose = () => setConnectionStatus('disconnected');
    const handleStatus = ({ status }: { status: string }) => {
      if (status === 'connecting') setConnectionStatus('reconnecting');
      else if (status === 'connected') setConnectionStatus('connected');
      else if (status === 'disconnected') setConnectionStatus('disconnected');
    };

    prov.on('synced', handleSynced);
    prov.on('connect', handleConnect);
    prov.on('disconnect', handleDisconnect);
    prov.on('close', handleClose);
    prov.on('status', handleStatus);

    const awareness = prov.awareness;
    let updateActiveUsers: (() => void) | null = null;

    if (awareness) {
      awareness.setLocalStateField('user', { name: userName, color });

      updateActiveUsers = () => {
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
    }

    return () => {
      prov.off('synced', handleSynced);
      prov.off('connect', handleConnect);
      prov.off('disconnect', handleDisconnect);
      prov.off('close', handleClose);
      prov.off('status', handleStatus);
      if (awareness && updateActiveUsers) {
        awareness.off('change', updateActiveUsers);
      }
      prov.destroy();
    };
  }, [pageId, ydoc, userName, color]);

  return {
    ydoc,
    synced,
    user: { name: userName, color },
    connectionStatus,
    activeUsers,
  };
}
