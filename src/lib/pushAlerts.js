// Advisory alerts on this device (Web Push, migration 032).
// Server: backend/api/push_subscribe.php, sending in advisory_push.php.
// Works on HTTPS sites and on localhost. On iPhone it works only after the
// site is added to the Home Screen (iOS 16.4+).

const API_BASE = '/api_backend';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  && window.isSecureContext;

const keyToBytes = (b64url) => {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

const registration = () => navigator.serviceWorker.register('/sw.js');

/** 'unsupported' | 'blocked' | 'off' | 'on' */
export async function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'on' : 'off';
}

/** Turns alerts on. Resolves { ok, message }. */
export async function enablePush(language = 'en') {
  if (!pushSupported()) return { ok: false, message: 'This browser can\'t receive alerts. On iPhone, add PB2Link to your Home Screen first.' };
  let keyInfo;
  try {
    keyInfo = await (await fetch(`${API_BASE}/push_subscribe.php?action=key`, { credentials: 'include' })).json();
  } catch {
    return { ok: false, message: 'Unable to reach the server.' };
  }
  if (!keyInfo?.enabled || !keyInfo.public_key) return { ok: false, message: 'Alerts on devices are not set up on this server yet.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, message: 'Notifications are blocked. Allow them for this site in your browser settings.' };
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(keyInfo.public_key) });
    const res = await fetch(`${API_BASE}/push_subscribe.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON(), language }),
    });
    const data = await res.json();
    if (!data.success) await sub.unsubscribe().catch(() => {});
    return { ok: !!data.success, message: data.message };
  } catch {
    return { ok: false, message: 'Alerts could not be turned on in this browser.' };
  }
}

/** Turns alerts off. Resolves { ok, message }. */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch(`${API_BASE}/push_subscribe.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
    return { ok: true, message: 'Alerts are off for this device.' };
  } catch {
    return { ok: false, message: 'Alerts could not be turned off.' };
  }
}
