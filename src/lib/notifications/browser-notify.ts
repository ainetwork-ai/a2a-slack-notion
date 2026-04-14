export function requestPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function sendBrowserNotification(title: string, body: string, onClick?: () => void) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'slack-a2a',
    });
    if (onClick) {
      n.onclick = () => { onClick(); window.focus(); };
    }
    // Auto-close after 5 seconds
    setTimeout(() => n.close(), 5000);
  }
}
