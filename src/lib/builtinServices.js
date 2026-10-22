// Built-in services' settings from Services Management (services.php
// get_builtin, migration 031): the heading residents see, Open / Closed, and
// the extra questions staff added to the end of the form.
import { createContext, useContext } from 'react';

const API_BASE = '/api_backend';
const cache = new Map();

/** { service, fields } for a built-in service key; cached for 60 seconds. */
export function fetchBuiltinService(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.promise;
  const promise = fetch(`${API_BASE}/services.php?action=get_builtin&key=${encodeURIComponent(key)}`, { credentials: 'include' })
    .then((r) => r.json())
    .then((d) => (d.success ? { service: d.service, fields: d.fields || [] } : null))
    .catch(() => null);
  cache.set(key, { at: Date.now(), promise });
  promise.then((v) => { if (!v) cache.delete(key); });
  return promise;
}

export const BuiltinServiceContext = createContext({ key: null, service: null, fields: [] });

/** The current built-in service (inside BuiltinServiceGate). */
export const useBuiltinService = () => useContext(BuiltinServiceContext);

/** The heading residents see: the name staff set, or the page's own default. */
export const useServiceTitle = (fallback) => {
  const { service } = useBuiltinService();
  return service?.title || fallback;
};
