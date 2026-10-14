import { useEffect, useState } from 'react';

// Street and subdivision pick lists (address_options.php, migration 026).
// One request per page load, shared by every address field on the page.

const API_BASE = '/api_backend';

let cache = null;
let inflight = null;
let loadedAt = 0;
// A page can stay open a long time; names staff add or unhide meanwhile are
// picked up the next time an address field is focused after this long.
const STALE_MS = 60 * 1000;
const listeners = new Set();

export const loadAddressOptions = (force = false) => {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = fetch(`${API_BASE}/address_options.php`)
    .then((res) => res.json())
    .then((json) => {
      if (!json.success) throw new Error('Not loaded');
      cache = { subdivisions: json.subdivisions || [], streets: json.streets || [] };
      loadedAt = Date.now();
      return cache;
    })
    // Without the list the fields still work as plain text boxes.
    .catch(() => cache || { subdivisions: [], streets: [] })
    .then((data) => {
      inflight = null;
      listeners.forEach((fn) => fn(data));
      return data;
    });
  return inflight;
};

/** Reloads the list in the background when the copy on the page is old. */
export const refreshAddressOptionsIfStale = () => {
  if (!inflight && Date.now() - loadedAt > STALE_MS) loadAddressOptions(true);
};

/** Called after staff edit the list, so open forms pick up the change. */
export const setAddressOptions = (data) => {
  cache = { subdivisions: (data.subdivisions || []).filter((s) => Number(s.is_active) === 1), streets: (data.streets || []).filter((s) => Number(s.is_active) === 1) };
  loadedAt = Date.now();
  listeners.forEach((fn) => fn(cache));
};

export const useAddressOptions = () => {
  const [data, setData] = useState(cache);
  useEffect(() => {
    listeners.add(setData);
    loadAddressOptions().then(setData);
    return () => { listeners.delete(setData); };
  }, []);
  return data;
};

export const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
