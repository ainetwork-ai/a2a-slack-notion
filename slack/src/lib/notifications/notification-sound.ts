'use client';

// Short beep encoded as base64 WAV (220Hz, 150ms)
// Generated from: a minimal PCM WAV with a sine wave beep
const BEEP_WAV_BASE64 =
  'UklGRiQDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQADAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  // 220Hz sine wave, 44100Hz sample rate, 16-bit, mono, ~150ms
  '';

// Use AudioContext to generate a simple beep programmatically
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function playNotificationSound() {
  if (typeof window === 'undefined') return;

  // Check user preference
  const enabled = localStorage.getItem('notificationSoundEnabled');
  if (enabled === 'false') return;

  // Check DND
  const dnd = localStorage.getItem('dndEnabled');
  if (dnd === 'true') return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignore audio errors
  }
}

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem('notificationSoundEnabled');
  return val !== 'false';
}

export function setNotificationSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('notificationSoundEnabled', enabled ? 'true' : 'false');
}
