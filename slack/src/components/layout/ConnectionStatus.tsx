'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    // Initialise from current state
    setOnline(navigator.onLine);
    setShowBanner(!navigator.onLine);

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function handleOffline() {
      setOnline(false);
      setReconnecting(false);
      setShowBanner(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }

    function handleOnline() {
      setOnline(true);
      setReconnecting(true);
      // Brief "reconnecting" flash then dismiss banner
      reconnectTimer = setTimeout(() => {
        setShowBanner(false);
        setReconnecting(false);
      }, 1500);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div
      className={[
        'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium shrink-0 transition-colors',
        online && reconnecting
          ? 'bg-green-700/80 text-green-100'
          : 'bg-yellow-600/80 text-yellow-100',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {!(online && reconnecting) && <WifiOff className="w-4 h-4 shrink-0" />}
      <span>
        {online && reconnecting
          ? 'Back online!'
          : "You're offline. Reconnecting..."}
      </span>
    </div>
  );
}
