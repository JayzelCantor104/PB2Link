/* PB2Link service worker (registered on every page by src/lib/offline.js).
 *
 * 1. Offline emergency information. The light page /emergency.html and the
 *    public data it reads (the active advisory and evacuation centers from
 *    disaster_risk.php, hotlines and guides from preparedness.php) are kept on
 *    the phone. Data is network-first: a fresh copy whenever there is signal,
 *    the saved copy when there isn't (marked with X-PB2-Saved-At).
 *    Any page opened without a connection falls back to /emergency.html.
 *    Nothing personal is stored: only those two public responses.
 * 2. Barangay advisories sent by Web Push (backend/api/advisory_push.php).
 *
 * Bump VERSION when the precached files change. */

const VERSION = 'v2';
const SHELL_CACHE = `pb2-shell-${VERSION}`;
const DATA_CACHE = `pb2-data-${VERSION}`;
const EMERGENCY_PAGE = '/emergency.html';
const PRECACHE = [EMERGENCY_PAGE, '/manifest.webmanifest', '/icons/icon-192.png'];
// The public data the emergency page shows. Matched by file and action, so the
// same copy serves the full site and the emergency page.
const DATA_URLS = [
  '/api_backend/disaster_risk.php?action=get_all',
  '/api_backend/preparedness.php?action=overview',
];
const DATA_TIMEOUT_MS = 8000;
const REFRESH_EVERY_MS = 10 * 60 * 1000;
let lastRefresh = 0;

const isDataRequest = (url) => {
  const file = url.pathname.split('/').pop();
  const action = url.searchParams.get('action') || '';
  return (file === 'disaster_risk.php' && action === 'get_all') || (file === 'preparedness.php' && action === 'overview');
};

// Store a copy with the time it was saved (never a failed or refused answer).
const saveData = async (key, response) => {
  if (!response || !response.ok) return;
  const body = await response.clone().text();
  try {
    if (JSON.parse(body).success !== true) return;
  } catch {
    return;
  }
  const headers = new Headers(response.headers);
  headers.set('X-PB2-Saved-At', new Date().toISOString());
  const cache = await caches.open(DATA_CACHE);
  await cache.put(key, new Response(body, { status: 200, headers }));
};

const refreshData = async () => {
  if (Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
  lastRefresh = Date.now();
  await Promise.all(DATA_URLS.map(async (u) => {
    try {
      const res = await fetch(u, { credentials: 'omit', cache: 'no-store' });
      await saveData(u, res);
    } catch {
      // offline: keep the copy we have
    }
  }));
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await refreshData();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, DATA_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('pb2-') && !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Public emergency data: fresh when possible, the saved copy otherwise.
  if (isDataRequest(url)) {
    const key = `${url.pathname}?action=${url.searchParams.get('action')}`;
    event.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), DATA_TIMEOUT_MS);
        // Save the public version only (a staff session also sees practice
        // advisories), refreshed separately without cookies.
        event.waitUntil(saveDataPublic(key));
        return res;
      } catch {
        const saved = await caches.match(key, { cacheName: DATA_CACHE });
        if (saved) return saved;
        return new Response(JSON.stringify({ success: false, offline: true, message: 'No connection and no saved copy yet.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  if (req.mode !== 'navigate') return;

  // The emergency page: /emergency (the link in advisory texts) or /emergency.html.
  if (url.pathname === '/emergency' || url.pathname === EMERGENCY_PAGE) {
    event.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(EMERGENCY_PAGE, { cache: 'no-store' }), DATA_TIMEOUT_MS);
        if (res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(EMERGENCY_PAGE, res.clone());
          return res;
        }
        throw new Error('bad status');
      } catch {
        return (await caches.match(EMERGENCY_PAGE, { cacheName: SHELL_CACHE })) || Response.error();
      }
    })());
    return;
  }

  // Any other page: the network as usual (no time limit, a slow page is still
  // the right page). Without a connection, the saved emergency page instead.
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      event.waitUntil(refreshData());
      return res;
    } catch {
      const page = await caches.match(EMERGENCY_PAGE, { cacheName: SHELL_CACHE });
      return page || Response.error();
    }
  })());
});

// Keeps the saved copy public: fetched again without cookies (throttled).
const saveDataPublic = async (key) => {
  const meta = await caches.match(key, { cacheName: DATA_CACHE });
  const savedAt = meta ? Date.parse(meta.headers.get('X-PB2-Saved-At') || '') : 0;
  if (savedAt && Date.now() - savedAt < 60 * 1000) return;
  try {
    const res = await fetch(key, { credentials: 'omit', cache: 'no-store' });
    await saveData(key, res);
  } catch {
    // keep the copy we have
  }
};

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Barangay Pasong Buaya II', body: event.data ? event.data.text() : '' };
  }
  const urgent = data.level === 'Warning' || data.level === 'Severe';
  event.waitUntil(self.registration.showNotification(data.title || 'Barangay advisory', {
    body: data.body || 'Open PB2Link for details.',
    tag: data.tag || 'pb2-advisory',
    renotify: true,
    requireInteraction: urgent,
    icon: '/icons/icon-192.png',
    data: { url: data.url || '/emergency' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/emergency', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin)) {
        await w.focus();
        return w.navigate(url);
      }
    }
    return self.clients.openWindow(url);
  })());
});
