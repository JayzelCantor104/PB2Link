import { useEffect, useState } from 'react';

// Barangay council and About page text (about_content.php, migration 024).
// One shared list feeds the public About page and the printed certificates,
// signatures and Barangay ID (PrintTemplates.jsx).

const API_BASE = '/api_backend';
const UPLOADS_BASE = '/uploads_backend';

// Elected officials are shown with "HON." in front; the name is stored without it.
const ELECTED = ['punong_barangay', 'kagawad', 'sk_chair'];

export const ROLE_LABELS = {
  punong_barangay: 'Punong Barangay',
  kagawad: 'Kagawad',
  sk_chair: 'SK Chairperson',
  secretary: 'Barangay Secretary',
  treasurer: 'Barangay Treasurer',
  other: 'Other staff',
};

// Used only if the server can't be reached, so a printed certificate is never
// left without its roster. Matches the seed in migration 024.
const FALLBACK_OFFICIALS = [
  ['CARLITO C. TAGLE', 'PUNONG BARANGAY', 'punong_barangay'],
  ['ANTONIO A. VILLALON', 'COMMITTEE ON PEACE & ORDER', 'kagawad'],
  ['EDWIN CAPELLAN', 'COMMITTEE ON INFRASTRUCTURE', 'kagawad'],
  ['FLORENCE CAMERINO', 'COMMITTEE ON EDUCATION', 'kagawad'],
  ['RYAN NATO', 'COMMITTEE ON HEALTH', 'kagawad'],
  ['EDWIN CAPELLAN', 'COMMITTEE ON BUDGET', 'kagawad'],
  ['JOHN MATTHEW CAMERINO', 'COMMITTEE ON ENVIRONMENT', 'kagawad'],
  ['LEONOR MATEO', 'COMMITTEE ON WAYS & MEANS', 'kagawad'],
  ['SK CHAIRPERSON', 'SK CHAIRPERSON', 'sk_chair'],
  ['DIGNA E. CABRERA', 'BARANGAY SECRETARY', 'secretary'],
  ['FLORENCE CAMERINO', 'BARANGAY TREASURER', 'treasurer'],
].map(([full_name, position, role_key], i) => ({
  id: -(i + 1), full_name, position, role_key, photo_path: null, show_on_about: 1, show_on_print: 1,
}));

export const officialName = (o) => (o ? (ELECTED.includes(o.role_key) ? `HON. ${o.full_name}` : o.full_name) : '');
export const officialPhotoUrl = (o) => (o?.photo_path ? `${UPLOADS_BASE}/${o.photo_path}` : null);
export const initialsOf = (name) => String(name || '')
  .split(/\s+/).filter((w) => /^[A-ZÑ]/i.test(w) && !/^[A-Z]\.$/i.test(w)).slice(0, 2).map((w) => w[0]).join('');

// One request per page load, shared by every component that asks.
let cache = null;
let inflight = null;
const listeners = new Set();

export const loadAboutData = (force = false) => {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = fetch(`${API_BASE}/about_content.php`)
    .then((res) => res.json())
    .then((json) => {
      if (!json.success) throw new Error(json.message || 'Not loaded');
      cache = { content: json.content || {}, officials: json.officials || [], fallback: false };
      return cache;
    })
    .catch(() => cache || { content: {}, officials: FALLBACK_OFFICIALS, fallback: true })
    .then((data) => {
      inflight = null;
      listeners.forEach((fn) => fn(data));
      return data;
    });
  return inflight;
};

/** Called after an admin edit so open pages (and print previews) pick up the change. */
export const setAboutData = (data) => {
  cache = { content: data.content || {}, officials: data.officials || [], fallback: false };
  listeners.forEach((fn) => fn(cache));
};

export const useAboutData = () => {
  const [data, setData] = useState(cache);
  useEffect(() => {
    listeners.add(setData);
    loadAboutData().then(setData);
    return () => { listeners.delete(setData); };
  }, []);
  return data;
};

/** The roster for printed documents: rows shown in print, plus the two signers. */
export const usePrintOfficials = () => {
  const data = useAboutData();
  const list = (data?.officials || FALLBACK_OFFICIALS).filter((o) => Number(o.show_on_print) === 1);
  const roster = list.length ? list : FALLBACK_OFFICIALS;
  return {
    roster,
    captain: roster.find((o) => o.role_key === 'punong_barangay') || FALLBACK_OFFICIALS[0],
    secretary: roster.find((o) => o.role_key === 'secretary') || FALLBACK_OFFICIALS[9],
  };
};
