import { useEffect, useState } from 'react';

// Offline emergency information (public/sw.js, public/emergency.html).
// The service worker is registered on every page so the emergency page and
// its public data are already on the phone before signal is lost.

export const registerServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Service workers need HTTPS or localhost; elsewhere this just doesn't run.
  if (!window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
};

/** true while the browser reports a connection. */
export const useOnline = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};

export const EMERGENCY_URL = '/emergency';
